# Normalized price mapping

| Import field       | Target                | Validation                                         |
| ------------------ | --------------------- | -------------------------------------------------- |
| service_code       | Service.code          | exact unique stable code; max 80                   |
| service_name_th/en | Service.nameTh/nameEn | Thai required, max 255                             |
| category           | Service.category      | required max 80                                    |
| standard_price     | Price.amount          | nonnegative decimal text, <= 2 decimal digits      |
| unit               | Service.unit          | required max 40                                    |
| effective_from/to  | Price effective range | ISO Gregorian dates; end exclusive and after start |
| status             | Service.active        | active/inactive                                    |

All imported prices are staged first. Publication appends a new Price version; no historical version or booking snapshot is overwritten. Existing code/name/category mismatches block publication. Column names can be mapped explicitly through JSON in the import UI. Legacy employee/clinical fields remain unmapped until the workbook is available and reviewed.
