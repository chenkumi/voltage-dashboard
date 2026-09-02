# Voltage Dashboard

Voltage Dashboard is a frontend-only Vite WebMCP dashboard provider designed as an e-commerce operations automation platform. Its current product goal is to participate in the OpenAI WebMCP Challenge.

It exposes existing product, order, after-sales, inventory, and reporting modules to Agents through web pages and WebMCP tools. Agents can collect data, fill in content, prepare return reviews, create drafts, and generate operational reports. High-risk actions—including publishing, changing orders, issuing refunds, processing payments, and granting final approvals—must still be reviewed and completed by a user in the UI.

## Features

- Dashboard: Overview of operational metrics and pending tasks
- Products: Product data, specifications and description editing, categorization, and publishing drafts
- Orders: Safe lookup of orders, payment failures, and address issues
- Returns / RMA: Return eligibility, receiving, item-level inspection, refund approval, and restocking workflows
- Refund Approvals: Human review and refund approval queue
- Customers and Inventory: Customer and inventory data views
- Reports: Safe read-only SQL, query caching, and Report Canvas
- WebMCP: Route-aware tools for queries, navigation, form filling, and draft preparation, with an in-page fallback provider for testing

## Getting Started

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

The development server runs at `http://localhost:6171` by default. The demo credentials are username `guest` and password `123456`. These credentials are intended for local demonstrations only and do not represent a production authentication mechanism.

Common verification commands:

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

## WebMCP Demo

Try the deployed application:

- [Live Voltage Dashboard](https://voltage-webmcp-dashboard.chenkumi.chatgpt.site)
- [Three-minute WebMCP demo video](https://youtu.be/lOO6xTRnMfw)

Open the dashboard in an Agent or browser host that supports WebMCP. Sign in first, then discover the capabilities exposed by the current page. Available tools change with the active route and cover operational workflows for products, orders, returns, inventory, customers, and reports.

## Data and Safety Boundaries

- This project currently has no backend. It uses local seed data, browser storage, and demonstration data sources. Do not enter real customer, payment, or confidential company data.
- Agents may perform low-risk, traceable work such as searching, generating content, filling forms, categorizing, analyzing data, and preparing drafts.
- Product publishing, order status changes, refunds, payments, and other high-risk actions must be reviewed and completed by a user in the UI.
- Do not commit API keys, tokens, private keys, or other secrets. See [.env.example](.env.example) for an environment variable template.

For more detailed product and architecture documentation, see:

- [docs/COMMERCE-AUTOMATION.md](docs/COMMERCE-AUTOMATION.md)
- [docs/SMART-DASHBOARD.md](docs/SMART-DASHBOARD.md)
- [docs/RETURNS-RMA-SYSTEM-MODEL.md](docs/RETURNS-RMA-SYSTEM-MODEL.md)
- [.agents/rules/webmcp-data-safety.md](.agents/rules/webmcp-data-safety.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing. See [SECURITY.md](SECURITY.md) for security reporting instructions and guidance on data that must not be submitted. Release history is available in [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).
