# Stockify

A powerful Shopify product analytics and reporting dashboard built with React, TypeScript, and Tailwind CSS.

## Features

- **Multi-Store Support**: Connect multiple Shopify stores and view their products in one unified dashboard
- **Dynamic Columns**: Automatically detects and displays available product fields from your Shopify stores
- **Advanced Filtering**: Search, filter, and sort products by vendor, type, price, inventory, and more
- **Data Export**: Export product data to Excel for further analysis
- **User Authentication**: Secure login system to protect your data
- **Real-time Analytics**: View product statistics and analytics across all your stores
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Technologies Used

This project is built with:

- **Vite** - Fast build tool and dev server
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Accessible component library
- **Zustand** - State management
- **React Query** - Server state management
- **React Router** - Client-side routing
- **date-fns** - Date utilities
- **XLSX** - Excel export functionality

## Getting Started

### Prerequisites

- Node.js 16+ and npm/bun

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd shopiy-report
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Start the development server:
```bash
npm run dev
# or
bun run dev
```

The app will be available at `http://localhost:8080`

### Building for Production

```bash
npm run build
# or
bun run build
```

This will create an optimized production build in the `dist` folder.

### Preview Production Build

```bash
npm run preview
# or
bun run preview
```

## Project Structure

```
src/
├── components/          # Reusable React components
│   ├── dashboard/       # Dashboard-specific components
│   ├── ui/             # shadcn/ui components
│   └── ProtectedRoute.tsx
├── pages/              # Page components
├── lib/                # Utility functions and helpers
│   ├── shopify.ts      # Shopify API integration
│   ├── columnDetection.ts  # Dynamic column detection
│   ├── columnConfig.ts     # Column configuration
│   └── exportToExcel.ts    # Export functionality
├── stores/             # Zustand stores
│   ├── authStore.ts    # Authentication state
│   └── storeManagement.ts  # Store management state
├── hooks/              # Custom React hooks
├── App.tsx             # Main App component
└── main.tsx            # Entry point
```

## Configuration

### Adding Stores

Users can add new Shopify stores through the dashboard:
1. Click "Add Store" on the dashboard
2. Enter the store domain and storefront access token
3. The store will be added and products will be fetched automatically

### Customizing Columns

Edit `src/lib/columnConfig.ts` to customize which columns are visible and their labels:

```typescript
export const COLUMN_CONFIG = {
  visibleColumns: {
    title: true,
    vendor: false,  // Hide vendor column
    // ... other columns
  },
};
```

### Shopify API Setup

To use this app with your Shopify stores:

1. Create a Shopify app in your store's admin
2. Generate a Storefront API access token
3. Use the token when adding your store to the app

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run test` - Run tests once
- `npm run test:watch` - Run tests in watch mode

## Deployment

The app can be deployed to any static hosting service:

### Vercel
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm install -g netlify-cli
netlify deploy
```

### Docker
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=0 /app/dist .
CMD ["serve", "-s", ".", "-l", "8080"]
```

## Development

### Code Quality

The project uses ESLint for code quality. Run the linter:

```bash
npm run lint
```

### Testing

Run tests with:

```bash
npm run test
```

For watch mode:

```bash
npm run test:watch
```

## License

This project is open source and available under the MIT License.

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Made with ❤️ for Shopify store owners**
