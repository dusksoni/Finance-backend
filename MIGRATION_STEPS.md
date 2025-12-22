# Database Migration Steps for ICICI Payment Gateway

## Quick Migration

Run this command to apply the schema changes:

```bash
npx prisma migrate dev --name add_icici_payment_gateway
```

Or for production:

```bash
npx prisma migrate deploy
```

## What Gets Created

### New Tables

1. **PendingUPITransaction**
   - Stores QR generation requests
   - Tracks payment status until callback
   - Stores QR string and Intent URL

2. **UPIRefund**
   - Tracks refund requests to ICICI

### Schema Changes

- Added `pendingUPITransactions` relation to `Loan` model

## Manual Migration (if needed)

If you prefer to see the SQL before running:

```bash
# Generate migration without applying
npx prisma migrate dev --create-only --name add_icici_payment_gateway

# Review the SQL in prisma/migrations/

# Apply migration
npx prisma migrate dev
```

## Verify Migration

After migration, verify tables exist:

```bash
npx prisma studio
```

Check for:
- PendingUPITransaction table
- UPIRefund table

## Rollback (if needed)

If you need to rollback:

```bash
# Reset database (WARNING: loses all data)
npx prisma migrate reset

# Or manually drop tables
# DROP TABLE "PendingUPITransaction";
# DROP TABLE "UPIRefund";
```

## Production Migration

For production, always use:

```bash
npx prisma migrate deploy
```

This skips prompts and applies migrations safely.

---

**Status**: Ready to run
**Date**: December 2024
