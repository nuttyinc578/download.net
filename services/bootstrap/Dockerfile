FROM golang:1.26 AS build
WORKDIR /src
COPY services/bootstrap/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /bootstrap .
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /bootstrap /bootstrap
ENV PORT=5090 BOOTSTRAP_BIND=0.0.0.0
EXPOSE 5090
ENTRYPOINT ["/bootstrap"]
