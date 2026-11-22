# Decisions and assumptions

Filled in as the build goes. Assumption ids are referenced from docs/PLAN.md.

## Assumptions (where the acceptance criteria leave gaps)
- **A1. "I have chosen 5 products" means the owner curates them.** The home page shows 5 product ids
  listed in config (`FEATURED_PRODUCT_IDS`), in that order, validated at startup. No admin UI yet.
- **A2. "Top rated" within a category means highest Fake Store rating.** The category page shows the
  top 3 by `rating.rate` (ties broken by review count) as "Top rated", and the rest as "More in this
  category", also sorted by rating.
- **A3. "Text matching the search term"** means a case-insensitive substring match on title,
  description or category. Empty or whitespace-only searches are rejected.
- **A4. The sales inbox is one address**, set by `SALES_INBOX_EMAIL`. Locally it is caught by Mailpit.
- **A5. Contact details** are name and email (required), phone and message (optional). The enquiry is
  emailed, not stored.

## Dropped or simplified
_To be completed._

## How the design grows beyond the PoC
_To be completed._

## Next, with another day
_To be completed._
