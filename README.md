# eSign Platform 📝

A complete electronic signature platform with blockchain payments, document management, and real-time collaboration.

## Features ✨

- **User Authentication** - NextAuth with RS256 JWT tokens (7-day session)
- **Document Management** - Upload, store, and manage documents
- **Digital Signatures** - Sign documents with watermarking and validation
- **X402 Payments** - Blockchain-based payments on Base Sepolia testnet (0.0001 ETH per signature)
- **MetaMask Integration** - Seamless wallet connection and transactions
- **MFA/TOTP** - Multi-factor authentication support
- **Real-time Dashboard** - Monitor documents and signatures
- **PDF Management** - Generate, sign, and download PDFs

## Tech Stack 🛠️

### Frontend
- **Framework**: Next.js 16.2.1
- **UI**: React 18 + React Bootstrap
- **Payments**: ethers.js v6 (MetaMask)
- **Forms**: React Hook Form + Zod validation
- **Styling**: Bootstrap + CSS Modules

### Backend
- **Server**: Express.js (TypeScript)
- **Authentication**: NextAuth v5 + RS256 JWT
- **Database**: PostgreSQL 16.13 + Prisma 7.6.0
- **Blockchain**: X402 v2 Protocol, Base Sepolia (chainId: 84532)
- **Storage**: Local filesystem (dev) / AWS S3 (prod)
- **Cache**: Redis (optional, for sessions)

### Infrastructure
- **Monorepo**: pnpm 9 workspaces + Turbo
- **Deployment**: [Fly.io](https://fly.io) (recommended) / Vercel / Railway
- **Build**: Nixpacks (auto-detects pnpm)

## Project Structure 📁

```
esign-platform/
├── apps/
│   ├── api/               # Express backend (port 4000)
│   ├── web/               # Next.js frontend (port 3000)
│   └── docs/              # Documentation site
├── packages/
│   ├── db/                # Prisma schema & migrations
│   ├── crypto/            # RSA & AES cryptography utilities
│   ├── payments/          # X402 payment logic
│   ├── utils/             # Shared utilities (logger, Redis)
│   ├── auth/              # Authentication helpers
│   ├── types/             # Shared TypeScript types
│   ├── ui/                # React component library
│   └── typescript-config/ # Shared tsconfig
├── pnpm-workspace.yaml    # Workspace configuration
├── turbo.json             # Turbo build config
└── fly.toml               # Fly.io deployment config
```

## Getting Started 🚀

### Prerequisites
- Node.js 22+
- pnpm 9+ (`npm install -g pnpm@9`)
- PostgreSQL 16+
- (Optional) MetaMask browser extension for testing

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/Pixeeee/DocuSign.git
cd esign-platform

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values (JWT keys, Database URL, etc.)

# 4. Initialize database
pnpm --filter @esign/db migrate deploy

# 5. Start development server
pnpm dev
```

Access:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/health

### Environment Variables

See [.env.example](.env.example) for complete list:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/esign

# JWT (Generate with: openssl rand -base64 32)
JWT_PRIVATE_KEY=...
JWT_PUBLIC_KEY=...

# NextAuth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# X402 Payments
CHAIN_ID=84532  # Base Sepolia
PAYMENT_AMOUNT=0.0001  # ETH per signature

# AWS S3 (optional, for production)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=...
```

## Scripts 📚

```bash
# Development
pnpm dev              # Start all dev servers
pnpm build            # Build all packages & apps
pnpm turbo build      # Build with Turbo (faster)

# Database
pnpm db:migrate       # Run Prisma migrations
pnpm db:generate      # Generate Prisma types
pnpm db:studio        # Open Prisma Studio UI

# Linting & Type Checking
pnpm lint             # Run ESLint
pnpm type-check       # Run TypeScript checks

# Deployment
pnpm turbo build      # Build for production
```

## Deployment 🌐

### Fly.io (Recommended)

```bash
# Install Flyctl
npm install -g flyctl

# Login
fly auth login

# Launch (creates PostgreSQL automatically)
fly launch

# Set environment variables
fly secrets set JWT_PRIVATE_KEY="..." JWT_PUBLIC_KEY="..."

# Deploy
fly deploy

# View logs
fly logs
```

**URL**: https://esign-platform.fly.dev

See [FLY_DEPLOYMENT.md](./FLY_DEPLOYMENT.md) for detailed guide.

### Vercel

```bash
vercel --prod
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide.

### Railway & Others

Railway auto-detects the monorepo - just connect GitHub repo and deploy.

## API Endpoints 🔌

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/session` - Get current session

### Documents
- `GET /api/documents` - List user documents
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/:id` - Get document details
- `GET /api/documents/download?key=...` - Download document
- `DELETE /api/documents/:id` - Delete document

### Payments (X402)
- `POST /api/payments/initiate` - Start payment
- `POST /api/payments/confirm` - Confirm payment

### Signatures
- `POST /api/signatures/sign` - Sign document
- `GET /api/signatures/:id` - Get signature details

### Health
- `GET /api/health` - Health check (for monitoring)

## Database Schema 📊

Key tables:
- `User` - User accounts with authentication
- `Team` - Team management & collaboration
- `Document` - Document metadata & storage
- `Signature` - Digital signatures with verification
- `Payment` - X402 blockchain payment records
- `Session` - NextAuth session tracking
- `AuditLog` - Security audit trail

See [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) for full schema.

## Testing 🧪

```bash
# Build the entire project (validates all types)
pnpm build

# This will catch TypeScript errors across all packages
```

## Troubleshooting 🔧

**Port already in use?**
```bash
# Kill process on port 3000 or 4000
lsof -ti:3000 | xargs kill -9
lsof -ti:4000 | xargs kill -9
```

**Database connection error?**
```bash
# Check DATABASE_URL in .env.local
# Verify PostgreSQL is running
psql $DATABASE_URL
```

**MetaMask network not detected?**
- Manual add: Network Name `Base Sepolia`, RPC URL `https://sepolia.base.org`, Chain ID `84532`

## Contributing 🤝

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "feat: description"`
3. Push to GitHub: `git push origin feature/your-feature`
4. Open Pull Request

## License 📄

MIT License - See LICENSE file

## Support 💬

- Issues: [GitHub Issues](https://github.com/Pixeeee/DocuSign/issues)
- Discussions: [GitHub Discussions](https://github.com/Pixeeee/DocuSign/discussions)
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo build --filter=docs
```

Without global `turbo`:

```sh
npx turbo build --filter=docs
yarn exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo dev
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo dev --filter=web
```

Without global `turbo`:

```sh
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo login
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo link
```

Without global `turbo`:

```sh
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.dev/docs/reference/configuration)
- [CLI Usage](https://turborepo.dev/docs/reference/command-line-reference)
=======
# DocuSign
>>>>>>> 1505d92cdf88e984e83b328725c6ed2f01606301
