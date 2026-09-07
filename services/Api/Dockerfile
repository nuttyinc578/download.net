FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY services/Api/ services/Api/
RUN dotnet publish services/Api/Api.csproj -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app/services/Api
COPY --from=build /out/ ./
COPY web/ /app/web/
ENV ASPNETCORE_HTTP_PORTS=8080
ENV DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["dotnet", "Api.dll"]
