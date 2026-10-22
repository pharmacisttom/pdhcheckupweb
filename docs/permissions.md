# Server permission matrix

Booking mode changes require `calendar:write` (manager/superadmin). Callback request details require `bookings:read`; contact status and notes require `bookings:write` (registration/manager/superadmin). Callback reads and writes are audited; public request listing returns only the current session's reference/status, never staff notes or health details.

| Role         | Permissions                                                                      |
| ------------ | -------------------------------------------------------------------------------- |
| registration | dashboard read; bookings read/write; check-in                                    |
| manager      | dashboard; bookings read/write; package drafts; calendar; reports; organizations |
| laboratory   | catalog and import staging                                                       |
| finance      | price approval; financial read; reports; dashboard                               |
| clinician    | questionnaire editing permission; clinical read permission; package publication  |
| dpo          | privacy request read; audit read                                                 |
| auditor      | audit read; reports read                                                         |
| coordinator  | organization-own permission only; no health access                               |
| superadmin   | all defined permissions                                                          |

Unknown roles and unspecified actions deny by default. UI navigation is not an authorization boundary: route APIs always call guards. Public registration and booking endpoints additionally enforce session ownership. A booking reference never grants record access. Coordinator workflows are not enabled until organization ownership is fully implemented.

Package publication is separated from manager draft permission. Price publication requires finance permission and a different actor from the uploader, including for superadmins. Database administrators still require a separate change-management policy.
