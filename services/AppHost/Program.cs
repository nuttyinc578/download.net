var builder = DistributedApplication.CreateBuilder(args);
var secret = builder.AddParameter("bootstrap-secret", secret: true);
var api = builder.AddProject<Projects.Api>("nuttyinc-website")
    .WithHttpEndpoint(port: 5080, name: "public")
    .WithEnvironment("BOOTSTRAP_SECRET", secret);
builder.AddExecutable("nuttyinc-bootstrap", "go", "../bootstrap", "run", ".")
    .WithEnvironment("BOOTSTRAP_SECRET", secret)
    .WithEnvironment("NUTTY_API_URL", api.GetEndpoint("public"))
    .WithHttpEndpoint(port: 5090, env: "PORT")
    .WaitFor(api);
builder.Build().Run();
