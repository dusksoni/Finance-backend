# Master Data APIs - Complete Reference

This document provides a complete reference for all Master Data APIs in the Kushal Finance system.

## 📋 Overview

Master data APIs manage the foundational reference data used throughout the system. These include states, cities, regions, branches, showrooms, loan types, photo ID types, vehicle information, and equipment.

---

## 🗺️ Location Master Data

### States API
**Base Path:** `/api/state`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/state` | Get all states | Yes |
| GET | `/state/:id` | Get state by ID | Yes |
| POST | `/state` | Create new state | Yes (Admin only) |
| PUT | `/state/:id` | Update state | Yes (Admin only) |
| DELETE | `/state/:id` | Delete state | Yes (Admin only) |

**Sample Payload:**
```json
{
  "name": "Maharashtra",
  "stateCode": "27"
}
```

---

### Cities API
**Base Path:** `/api/city`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/city` | Get all cities | Yes |
| GET | `/city/:id` | Get city by ID | Yes |
| POST | `/city` | Create new city | Yes (Admin only) |
| PUT | `/city/:id` | Update city | Yes (Admin only) |
| DELETE | `/city/:id` | Delete city | Yes (Admin only) |

**Sample Payload:**
```json
{
  "name": "Mumbai",
  "stateId": "state-uuid"
}
```

---

### Regions API
**Base Path:** `/api/region`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/region` | Get all regions | Yes |
| GET | `/region/:id` | Get region by ID | Yes |
| POST | `/region` | Create new region | Yes (Admin only) |
| PUT | `/region/:id` | Update region | Yes (Admin only) |
| DELETE | `/region/:id` | Delete region | Yes (Admin only) |

**Sample Payload:**
```json
{
  "name": "South Mumbai",
  "stateId": "state-uuid",
  "cityId": "city-uuid"
}
```

**Hierarchy:** State → City → Region

---

## 🏢 Branch & Showroom Master Data

### Branches API
**Base Path:** `/api/list/branch`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/list/branch` | Get all branches | Yes |
| GET | `/list/branch/:id` | Get branch by ID | Yes |
| POST | `/list/branch` | Create new branch | Yes |
| PUT | `/list/branch/:id` | Update branch | Yes |
| DELETE | `/list/branch/:id` | Delete branch | Yes |
| GET | `/list/branch/:id/employees` | Get branch employees | Yes |
| GET | `/list/branch/:id/loans` | Get branch loans | Yes |
| GET | `/list/branch/:id/statistics` | Get branch statistics | Yes |

**Sample Payload:**
```json
{
  "name": "South Mumbai Branch",
  "regionId": "region-uuid",
  "address": "123 Main Street, Mumbai",
  "pincode": 400001,
  "latitude": 19.0760,
  "longitude": 72.8777,
  "phone": "022-12345678",
  "email": "mumbai@kushalfinance.com"
}
```

---

### Showrooms API
**Base Path:** `/api/list/showroom`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/list/showroom` | Get all showrooms | Yes |
| GET | `/list/showroom/:id` | Get showroom by ID | Yes |
| GET | `/list/showroom/branch/:branchId` | Get showrooms by branch | Yes |
| POST | `/list/showroom` | Create new showroom | Yes |
| PUT | `/list/showroom/:id` | Update showroom | Yes |
| DELETE | `/list/showroom/:id` | Delete showroom | Yes |

**Sample Payload:**
```json
{
  "name": "Premium Showroom",
  "branchId": "branch-uuid",
  "address": "456 Mall Road, Mumbai",
  "pincode": 400002,
  "latitude": 19.0760,
  "longitude": 72.8777,
  "phone": "022-11111111",
  "email": "showroom@kushalfinance.com"
}
```

**Hierarchy:** Region → Branch → Showroom

---

## 💰 Loan Type Master Data

### Loan Types API
**Base Path:** `/api/loanType`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/loanType` | Get all loan types | Yes |
| GET | `/loanType/:id` | Get loan type by ID | Yes |
| POST | `/loanType` | Create new loan type | Yes (Admin only) |
| PUT | `/loanType/:id` | Update loan type | Yes |
| DELETE | `/loanType/:id` | Delete loan type | Yes |

**Sample Payload:**
```json
{
  "name": "Two Wheeler",
  "label": "Two Wheeler Loan",
  "description": "Loan for purchasing two wheeler vehicles",
  "rules": {}
}
```

**Common Loan Types:**
- Two Wheeler
- Agriculture
- MSME

---

## 🆔 Photo ID Type Master Data

### Photo ID Types API
**Base Path:** `/api/photoId`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/photoId` | Get all photo ID types | Yes |
| GET | `/photoId/:id` | Get photo ID type by ID | Yes |
| POST | `/photoId` | Create new photo ID type | Yes |
| PUT | `/photoId/:id` | Update photo ID type | Yes |
| DELETE | `/photoId/:id` | Delete photo ID type | Yes |

**Sample Payload:**
```json
{
  "name": "Aadhaar Card",
  "description": "Unique Identification Number",
  "minLength": 12,
  "maxLength": 12,
  "numberTypeEg": "1234 5678 9012",
  "validation": "^[0-9]{12}$"
}
```

**Common Photo ID Types:**
- Aadhaar Card (12 digits)
- PAN Card (10 alphanumeric)
- Driving License
- Voter ID
- Passport

---

## 🏍️ Vehicle Master Data (Two Wheeler Loans)

### Brands API
**Base Path:** `/api/list/brands`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/list/brands` | Get all brands | Public |
| POST | `/list/brands` | Create new brand | Yes |
| PUT | `/list/brands/:id` | Update brand | Yes |
| DELETE | `/list/brands/:id` | Delete brand | Yes |

**Sample Payload:**
```json
{
  "name": "Honda"
}
```

---

### Models API
**Base Path:** `/api/list/models`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/list/models` | Get all models | Public |
| POST | `/list/models` | Create new model | Yes |
| PUT | `/list/models/:id` | Update model | Yes |
| DELETE | `/list/models/:id` | Delete model | Yes |

**Sample Payload:**
```json
{
  "name": "Activa",
  "brandId": "brand-uuid"
}
```

---

### Variants API
**Base Path:** `/api/list/variants`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/list/variants` | Get all variants | Public |
| POST | `/list/variants` | Create new variant | Yes |
| PUT | `/list/variants/:id` | Update variant | Yes |
| DELETE | `/list/variants/:id` | Delete variant | Yes |

**Sample Payload:**
```json
{
  "name": "6G",
  "modelId": "model-uuid"
}
```

**Hierarchy:** Brand → Model → Variant
**Example:** Honda → Activa → 6G

---

## 🚜 Equipment Master Data (Agriculture Loans)

### Equipment API
**Base Path:** `/api/list/equipment`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/list/equipment` | Get all equipment | Public |
| POST | `/list/equipment` | Create new equipment | Yes |
| PUT | `/list/equipment/:id` | Update equipment | Yes |
| DELETE | `/list/equipment/:id` | Delete equipment | Yes |

**Sample Payload:**
```json
{
  "name": "Tractor"
}
```

**Common Equipment Types:**
- Tractor
- Harvester
- Plough
- Irrigation Pump

---

## 📋 Lookup Lists (Public APIs)

### Genders API
**Endpoint:** `GET /api/list/genders`

**Description:** Get all gender options
**Auth Required:** No (Public endpoint)

**Sample Response:**
```json
[
  { "id": "uuid", "name": "Male", "value": "M" },
  { "id": "uuid", "name": "Female", "value": "F" },
  { "id": "uuid", "name": "Other", "value": "O" }
]
```

---

### Relation Types API
**Endpoint:** `GET /api/list/relation-types`

**Description:** Get all relation type options (Father, Mother, Spouse, etc.)
**Auth Required:** No (Public endpoint)

**Sample Response:**
```json
[
  { "id": "uuid", "name": "Father", "value": "F" },
  { "id": "uuid", "name": "Mother", "value": "M" },
  { "id": "uuid", "name": "Spouse", "value": "S" }
]
```

---

### Address Categories API
**Endpoint:** `GET /api/list/address-categories`

**Description:** Get all address category options (Permanent, Current, etc.)
**Auth Required:** No (Public endpoint)

**Sample Response:**
```json
[
  { "id": "uuid", "name": "Permanent Address", "value": "permanent" },
  { "id": "uuid", "name": "Current Address", "value": "current" },
  { "id": "uuid", "name": "Office Address", "value": "office" }
]
```

---

## 🔄 Common Workflows

### 1. Setup Location Hierarchy
```
1. POST /api/state (Create State)
2. POST /api/city (Create City with stateId)
3. POST /api/region (Create Region with stateId and cityId)
4. POST /api/list/branch (Create Branch with regionId)
5. POST /api/list/showroom (Create Showroom with branchId)
```

### 2. Setup Vehicle Data
```
1. POST /api/list/brands (Create Brand - Honda)
2. POST /api/list/models (Create Model - Activa with brandId)
3. POST /api/list/variants (Create Variant - 6G with modelId)
```

### 3. Setup Loan Types
```
1. POST /api/loanType (Create "Two Wheeler" loan type)
2. POST /api/loanType (Create "Agriculture" loan type)
3. POST /api/loanType (Create "MSME" loan type)
```

### 4. Setup Photo ID Types
```
1. POST /api/photoId (Create Aadhaar Card type)
2. POST /api/photoId (Create PAN Card type)
3. POST /api/photoId (Create Driving License type)
```

---

## 📊 Data Relationships

```
Location Hierarchy:
State
  └─ City
      └─ Region
          └─ Branch
              └─ Showroom

Vehicle Hierarchy (Two Wheeler):
Brand (Honda, Yamaha, etc.)
  └─ Model (Activa, FZ, etc.)
      └─ Variant (6G, V3, etc.)

User Related:
Gender → User
RelationType → User (for guardian/relation)
AddressCategory → UserAddress
PhotoIdType → PhotoID → User

Loan Related:
LoanType → Loan
Equipment → AgricultureLoan
Brand/Model/Variant → TwoWheelerLoan
```

---

## 🎯 Best Practices

### 1. Setup Order
Always create master data in this order:
1. States & Cities
2. Regions
3. Branches & Showrooms
4. Loan Types
5. Photo ID Types
6. Vehicle Brands/Models/Variants
7. Equipment (if using agriculture loans)

### 2. Data Integrity
- Don't delete master data that's referenced by active records
- Update instead of delete when possible
- Use soft delete (isDeleted flag) for branches/showrooms

### 3. Naming Conventions
- Use proper case for names (e.g., "Maharashtra" not "maharashtra")
- Keep state codes consistent (2-digit numeric)
- Use clear, descriptive names

### 4. Validation
- Ensure state exists before creating city
- Ensure city exists before creating region
- Ensure region exists before creating branch
- Ensure brand exists before creating model

---

## 🔒 Permission Requirements

| Operation | Admin Required | Notes |
|-----------|----------------|-------|
| Create State | Yes | Critical master data |
| Create City | Yes | Critical master data |
| Create Region | Yes | Critical master data |
| Create Branch | No | Admin or Employee |
| Create Showroom | No | Admin or Employee |
| Create Loan Type | Yes | Critical configuration |
| Create Photo ID Type | No | Admin or Employee |
| Create Vehicle Data | No | Admin or Employee |
| Get Lookup Lists | No | Public endpoints |

---

## 💡 Tips & Tricks

1. **Bulk Setup:** Use the bulk upload feature to import states, cities, and regions from Excel

2. **Query Optimization:** Most GET endpoints support query parameters:
   ```
   GET /api/list/models?brandId=honda-uuid
   ```

3. **Caching:** Lookup lists (genders, relation types, address categories) are rarely changed - cache them on frontend

4. **Search:** Use search parameters where available:
   ```
   GET /api/state?search=Maharashtra
   ```

5. **Soft Delete:** Branches and showrooms support soft delete via `isDeleted` flag

---

## 📞 Common Use Cases

### Use Case 1: Creating a New Branch
```javascript
// Step 1: Get available regions
GET /api/region

// Step 2: Create branch
POST /api/list/branch
{
  "name": "New Branch Name",
  "regionId": "selected-region-id",
  "address": "Full address",
  "pincode": 123456,
  "phone": "0123456789",
  "email": "branch@kushalfinance.com"
}
```

### Use Case 2: Adding a New Vehicle Model
```javascript
// Step 1: Get brands
GET /api/list/brands

// Step 2: Create model
POST /api/list/models
{
  "name": "New Model",
  "brandId": "selected-brand-id"
}

// Step 3: Create variants
POST /api/list/variants
{
  "name": "Variant 1",
  "modelId": "newly-created-model-id"
}
```

### Use Case 3: User Registration Form
```javascript
// Load all dropdown data
GET /api/list/genders
GET /api/list/relation-types
GET /api/list/address-categories
GET /api/photoId (for photo ID type dropdown)
GET /api/state (for state dropdown)

// When state selected, load cities
GET /api/city?stateId=selected-state-id
```

---

## 🐛 Troubleshooting

### Issue: "Region not found"
**Solution:** Ensure the state-city combination exists in the region table

### Issue: "Cannot delete state"
**Solution:** State is referenced by cities/regions. Delete or reassign them first

### Issue: "Duplicate entry"
**Solution:** Names must be unique. Check for existing records first

### Issue: "Invalid brandId"
**Solution:** Ensure the brand exists before creating a model

---

## 📚 Related Documentation

- [Main API Documentation](README.md)
- [Quick Reference Guide](QUICK_REFERENCE.md)
- [Bulk Upload Guide](../BULK_UPLOAD_GUIDE.md)
- [Database Schema](../prisma/schema.prisma)

---

**Last Updated:** 2024-01-20
**Total Master Data Endpoints:** 60+
