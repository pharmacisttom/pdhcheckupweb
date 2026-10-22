# Legacy workbook analysis

Only `Pasted text.txt` was present in the supplied attachment directory. The referenced `Copy of 1.(ต้นฉบับ)กรอกข้อมูลตรวจสุขภาพ.xlsx` and visual references were not attached. No original patient records, price labels, sheets, formulas, merged ranges, hidden columns, package groups or entitlement rules have been inferred.

Before migration, preserve a read-only original and SHA-256 hash. Inspect every sheet, merged region, row/column visibility, formulas, computed values, data validation and workbook metadata. Produce an evidence-backed sheet/cell mapping, identify blank formatted rows and distinguish patient data from pricing/reference content. Obtain clinical/finance approval for mappings; never match HIS codes by approximate names automatically.

The bounded import subsystem accepts normalized pricing templates only; it is not a claim that the missing legacy workbook can be migrated unchanged.
