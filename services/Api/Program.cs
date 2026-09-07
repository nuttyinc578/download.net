using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var desktopMode = Environment.GetEnvironmentVariable("NUTTY_DESKTOP") == "1";
if (desktopMode) builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Services.AddRateLimiter(o => {
    o.RejectionStatusCode = 429;
    o.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new() { PermitLimit = 12, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.AddHttpClient("catalog", c => c.Timeout = TimeSpan.FromSeconds(15));
var app = builder.Build();
app.UseRateLimiter();
app.Use(async (ctx, next) => {
    ctx.Response.Headers.XContentTypeOptions = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "same-origin";
    await next();
});
var root = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "../../"));
var web = Path.Combine(root, "web");
if (Directory.Exists(web)) {
    var provider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(web);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
}
var dataDir = Path.GetFullPath(Environment.GetEnvironmentVariable("DATA_DIR") ?? Path.Combine(root, "data"));
Directory.CreateDirectory(dataDir);
var usersFile = Path.Combine(dataDir, "users.json");
var users = File.Exists(usersFile) ? JsonSerializer.Deserialize<List<Account>>(await File.ReadAllTextAsync(usersFile))! : new List<Account>();
var userLock = new SemaphoreSlim(1);
var sessions = new ConcurrentDictionary<string, Session>();
var usedTickets = new ConcurrentDictionary<string, long>();
var secret = Environment.GetEnvironmentVariable("BOOTSTRAP_SECRET") ?? "";
if (Encoding.UTF8.GetByteCount(secret) < 32) throw new InvalidOperationException("Set BOOTSTRAP_SECRET to at least 32 random characters.");
var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var catalogLock = new SemaphoreSlim(1);
List<AppManifest> catalog = [];
DateTimeOffset catalogExpiry = DateTimeOffset.MinValue;
async Task<List<AppManifest>> Catalog() {
    await catalogLock.WaitAsync();
    try {
        if (DateTimeOffset.UtcNow < catalogExpiry) return catalog;
        string body;
        var localCatalog = Environment.GetEnvironmentVariable("CATALOG_FILE");
        if (app.Environment.IsDevelopment() && !string.IsNullOrWhiteSpace(localCatalog)) {
            body = await File.ReadAllTextAsync(Path.GetFullPath(localCatalog));
        } else {
        var url = Environment.GetEnvironmentVariable("CATALOG_URL") ?? "https://raw.githubusercontent.com/nuttyinc578/download.net/main/catalog/apps.json";
        var parsed = new Uri(url);
        if (parsed.Scheme != "https" || parsed.Host != "raw.githubusercontent.com") throw new InvalidOperationException("CATALOG_URL must use raw.githubusercontent.com over HTTPS.");
        var client = app.Services.GetRequiredService<IHttpClientFactory>().CreateClient("catalog");
        body = await client.GetStringAsync(url);
        }
        if (body.Length > 2_000_000) throw new InvalidDataException("Catalog too large.");
        var next = JsonSerializer.Deserialize<List<AppManifest>>(body, jsonOptions) ?? [];
        if (next.Count > 5000 || next.Any(m => !m.Valid())) throw new InvalidDataException("Invalid catalog.");
        catalog = next; catalogExpiry = DateTimeOffset.UtcNow.AddMinutes(5);
        await File.WriteAllTextAsync(Path.Combine(dataDir, "catalog-cache.json"), body);
        return catalog;
    } finally { catalogLock.Release(); }
}
string SessionKey(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
Session? Current(HttpContext ctx) {
    var token = ctx.Request.Cookies["nutty_session"];
    if (token is null || !sessions.TryGetValue(SessionKey(token), out var session)) return null;
    if (session.Expires < DateTimeOffset.UtcNow) { sessions.TryRemove(SessionKey(token), out _); return null; }
    return session;
}
void SetSession(HttpContext ctx, Account account) {
    foreach (var old in sessions.Where(s => s.Value.Expires < DateTimeOffset.UtcNow).ToArray()) sessions.TryRemove(old.Key, out _);
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    sessions[SessionKey(token)] = new(account.Name, account.Email, DateTimeOffset.UtcNow.AddDays(7));
    ctx.Response.Cookies.Append("nutty_session", token, new CookieOptions { HttpOnly = true, Secure = ctx.Request.IsHttps || (!app.Environment.IsDevelopment() && !desktopMode), SameSite = SameSiteMode.Strict, MaxAge = TimeSpan.FromDays(7), Path = "/" });
}
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "nuttyinc-aspire-api" }));
app.MapPost("/api/auth/signup", async (HttpContext ctx, Credentials input) => {
    var email = (input.Email ?? "").Trim().ToLowerInvariant(); var name = (input.Name ?? "").Trim();
    if (email.Length > 254 || !System.Net.Mail.MailAddress.TryCreate(email, out var mail) || mail.Address != email || name.Length is < 2 or > 60 || input.Password is null || input.Password.Length is < 12 or > 128)
        return Results.BadRequest(new { error = "Use a valid email, a 2–60 character name, and a 12–128 character password." });
    await userLock.WaitAsync();
    try {
        if (users.Any(u => u.Email == email)) return Results.Conflict(new { error = "An account with that email already exists." });
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(input.Password, salt, 600_000, HashAlgorithmName.SHA256, 32);
        var account = new Account(name, email, Convert.ToHexString(salt), Convert.ToHexString(hash));
        var next = users.Append(account).ToList();
        await File.WriteAllTextAsync(usersFile + ".tmp", JsonSerializer.Serialize(next));
        File.Move(usersFile + ".tmp", usersFile, true); users = next;
        SetSession(ctx, account);
        return Results.Ok(new { name, email });
    } finally { userLock.Release(); }
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/login", async (HttpContext ctx, Credentials input) => {
    if (input.Password is null || input.Password.Length > 128) return Results.BadRequest(new { error = "Invalid credentials." });
    Account? account;
    await userLock.WaitAsync();
    try { account = users.FirstOrDefault(u => u.Email == (input.Email ?? "").Trim().ToLowerInvariant()); } finally { userLock.Release(); }
    var salt = account is null ? new byte[16] : Convert.FromHexString(account.Salt);
    var hash = Rfc2898DeriveBytes.Pbkdf2(input.Password, salt, 600_000, HashAlgorithmName.SHA256, 32);
    if (account is null || !CryptographicOperations.FixedTimeEquals(hash, Convert.FromHexString(account.Hash))) return Results.Json(new { error = "Email or password is incorrect." }, statusCode: 401);
    SetSession(ctx, account); return Results.Ok(new { account.Name, account.Email });
}).RequireRateLimiting("auth");
app.MapGet("/api/auth/me", (HttpContext ctx) => Current(ctx) is { } s ? Results.Ok(new { s.Name, s.Email }) : Results.Unauthorized());
app.MapPost("/api/auth/logout", (HttpContext ctx) => {
    if (ctx.Request.Cookies["nutty_session"] is { } t) sessions.TryRemove(SessionKey(t), out _);
    ctx.Response.Cookies.Delete("nutty_session", new CookieOptions { Path = "/" }); return Results.Ok();
});
app.MapPost("/api/verify", (Ticket ticket) => {
    if (ticket.Nonce is null || ticket.Signature is null || ticket.Nonce.Length != 32 || ticket.Expires < DateTimeOffset.UtcNow.ToUnixTimeSeconds() || ticket.Expires > DateTimeOffset.UtcNow.AddMinutes(3).ToUnixTimeSeconds()) return Results.Unauthorized();
    var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{ticket.Nonce}.{ticket.Expires}"));
    byte[] actual; try { actual = Convert.FromHexString(ticket.Signature); } catch { return Results.Unauthorized(); }
    if (!CryptographicOperations.FixedTimeEquals(expected, actual)) return Results.Unauthorized();
    foreach (var old in usedTickets.Where(t => t.Value < DateTimeOffset.UtcNow.ToUnixTimeSeconds()).ToArray()) usedTickets.TryRemove(old.Key, out _);
    if (!usedTickets.TryAdd(ticket.Nonce, ticket.Expires)) return Results.Conflict(new { error = "Ticket already used. Reconnect to bootstrap." });
    return Results.Ok(new { verified = true });
}).RequireRateLimiting("auth");
app.MapGet("/api/apps", async () => {
    try { return Results.Ok(new { apps = await Catalog(), cachedUntil = catalogExpiry }); }
    catch { return Results.Json(new { error = "The reviewed GitHub catalog is unavailable. Please try again shortly." }, statusCode: 503); }
});
app.MapGet("/api/apps/{id}/download", async (string id) => {
    try { var item = (await Catalog()).SingleOrDefault(m => m.Id == id); return item is null ? Results.NotFound(new { error = "App not found." }) : Results.Ok(item); }
    catch { return Results.Json(new { error = "Catalog unavailable." }, statusCode: 503); }
});
if (desktopMode) {
    app.Lifetime.ApplicationStarted.Register(() => Console.WriteLine("NUTTYINC_READY " + JsonSerializer.Serialize(new { protocol = 1, url = app.Urls.Single() })));
    _ = Task.Run(async () => { await Console.In.ReadToEndAsync(); app.Lifetime.StopApplication(); });
}
app.Run();

record Account(string Name, string Email, string Salt, string Hash);
record Session(string Name, string Email, DateTimeOffset Expires);
record Credentials(string? Name, string? Email, string? Password);
record Ticket(string Nonce, long Expires, string Signature);
record AppManifest(string Id, string Name, string Description, string Kind, string Version, string Publisher, string Url, string Sha256, long Size, string License) {
    public bool Valid() => System.Text.RegularExpressions.Regex.IsMatch(Id ?? "", "^[a-z0-9][a-z0-9-]{1,63}$") && !string.IsNullOrWhiteSpace(Name) && Name.Length <= 100 && Description is { Length: <= 2000 } && Kind is "app" or "game" && Version is { Length: > 0 and <= 40 } && Publisher is { Length: > 0 and <= 100 } && License is { Length: > 0 and <= 100 } && Size is > 0 and <= 2_147_483_648 && System.Text.RegularExpressions.Regex.IsMatch(Sha256 ?? "", "^[a-f0-9]{64}$") && Uri.TryCreate(Url, UriKind.Absolute, out var u) && u.Scheme == "https" && u.Host == "github.com" && u.Port == 443 && u.UserInfo == "" && u.Query == "" && u.Fragment == "" && System.Text.RegularExpressions.Regex.IsMatch(u.AbsolutePath, "^/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\\.vfdn$");
}

