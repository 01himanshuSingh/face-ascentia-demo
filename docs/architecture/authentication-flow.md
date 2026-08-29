# Authentication Flow

Employee login via Mendix → SDK → `POST /authenticate`. See `PROJECT_CONTEXT.md` § Authentication Flow for the step list.

## Not enrolled → registration branch

When the employee exists but has no **ACTIVE** face enrollment, the backend returns:

- HTTP **404**
- Code **`ENROLLMENT_NOT_FOUND`**

Mendix then branches:

- **Employee Register (Path A)** — Register UI with Employee ID only; SDK reuses auth JPEG → `POST /register`.
- **Admin Login (Path B)** — SDK overlay; admin ID + password, then **fresh capture + Employee ID per employee** → `/kiosk/admin-enroll`.

Full sequences: **[registration-flow.md](./registration-flow.md)**.

## Wrong face vs not enrolled

| Outcome | HTTP | Code | Next UI |
|---------|------|------|---------|
| Match | 200 | — | `authenticated: true` → login |
| Wrong face (enrolled) | 200 | — | `authenticated: false` → denied |
| Not face-enrolled | 404 | `ENROLLMENT_NOT_FOUND` | SDK Not Enrolled → Employee Register **or** Admin Login |
| Unknown employee | 404 | `EMPLOYEE_NOT_FOUND` | Contact HR |
