# Factory Careers CLI

Install the CLI from npm:

```bash
npm install -g @thefactory/careers-cli
factory-careers --help
```

Authenticate with OAuth 2.0 Device Authorization:

```bash
factory-careers auth login
```

Run missing-only scoring as a durable batch, or resume an existing batch:

```bash
factory-careers applications analyze-missing --yes --json
factory-careers processing get batch_123 --json
factory-careers processing drain batch_123 --yes --json
```

Read a bounded, server-filtered job pipeline page:

```bash
factory-careers jobs pipeline JOB_ID --stage new --limit 25 --json
```

Full command documentation lives in the repository guide at `docs/CLI.md`.
