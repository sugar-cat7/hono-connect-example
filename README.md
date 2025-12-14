### Getting Started

```bash
$ pnpm i
$ pnpm exec buf dep update
$ pnpm exec buf lint
$ pnpm exec buf generate
```

### Generate Self-Signed SSL Certificates

```bash
$ openssl genrsa -out certs/server.key 2048
$ openssl req -new -x509 -key certs/server.key -out certs/server.crt -days 365 -subj "/CN=localhost"
```

### Run the Application

- json
```bash
$ pnpm dev
$ curl -k --http2 -X POST https://localhost:3000/connectrpc.eliza.v1.ElizaService/Say -H "Content-Type: application/json" -d '{"sentence": "Hello!"}'
{"sentence":"You said: \"Hello!\" (requestId: 5218aa04-4e23-41b7-9e38-8685b7c28188)"}
$ 
```

- gRPC
```bash
$ pnpm exec buf build -o eliza.protoset
$ grpcurl -insecure -protoset eliza.protoset -d '{"sentence":"Hello!"}' localhost:3000 connectrpc.eliza.v1.ElizaService/Say
{
  "sentence": "You said: \"Hello!\" (requestId: c614b282-6e5b-4f8c-8d8b-df32d350b493)"
}