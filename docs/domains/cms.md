# CMS (Content Management System) Domain Architecture

## Overview
The CMS domain manages tenant-isolated public-facing content delivery. It consolidates scattered legacy page tables into a single, polymorphic `contentNodes` model supporting pages, news articles, events, testimonials, galleries, image sliders, and navigation menus.

### Key Business Logic
- **Polymorphic Content**: A single `contentNodes` table with `contentType` enum: `page`, `news`, `event`, `testimonial`, `gallery`, `slider`, `menu_item`.
- **Hierarchical Structure**: `parentId` self-referential FK enables menu hierarchies and gallery item grouping.
- **SEO Support**: `slug` for URL routing, `seoFocusKeyword` and `seoDescription` in metadata.
- **Publishing Lifecycle**: `publishedStatus` with `publishedAt` and `expiresAt` for content scheduling.
- **Category System**: Links to `enumerations` from Core domain for flexible categorization.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-cms.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_front_cms_pages` / `sm_pages` | `contentNodes` (type: `page`) | Static pages with slug routing. |
| `sm_news` | `contentNodes` (type: `news`) | News articles with publish dates. |
| `sm_events` | `contentNodes` (type: `event`) | Events with date/location metadata. |
| `sm_about_pages` / `sm_contact_pages` | `contentNodes` (type: `page`) | Merged into generic pages. |
| `sm_course_pages` | `contentNodes` (type: `page`) | Course landing pages. |
| `home_sliders` | `contentNodes` (type: `slider`) | Image sliders with link URLs. |
| — (new) | `contentNodes` (type: `testimonial`) | Client testimonials. |
| — (new) | `contentNodes` (type: `gallery`) | Image galleries. |
| — (new) | `contentNodes` (type: `menu_item`) | Navigation menu hierarchy. |

---

## Technical Implementation

### Core Entity

#### [ContentNodes](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-cms.ts#L41)
Polymorphic content entity. `contentType` + `slug` for routing. `parentId` for hierarchy. `categoryId` links to Core `enumerations`. JSON `metadata` stores type-specific data (event dates, testimonial info, slider links, SEO).

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `cms.createPage(nodeData)`: Initializes a new content node (page, news, event).
- `cms.publishContent(nodeId)`: Transitions content state to live after validation.
- `generate_page_content`: AI-generated content for pages, news, and event descriptions.
- `optimize_seo_metadata`: AI-driven SEO keyword and description generation.
- `publish_scheduler`: Manages scheduled publish/unpublish based on dates.
- `build_navigation_tree`: Resolves parent/child hierarchy into a navigation menu.
- `validate_media_links`: Checks all image/media URLs for broken links.

### [STRESS DEFENSE] Tools
- `content_cache_invalidator`: Busts CDN/edge caches when content is updated.
- `slug_collision_detector`: Prevents duplicate slugs within a tenant.
- `xss_content_sanitizer`: Sanitizes HTML/rich text content before persistence.

---

## PBAC & Security
- **TenantAdmin**: Full CMS management.
- **Content Editor (Staff)**: Create/edit content within tenant scope.
- **Public/Guest**: Read-only access to published content.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/cms/content` | List content by type | Public |
| `GET` | `/api/v1/cms/content/:slug` | Get content by slug | Public |
| `POST` | `/api/v1/cms/content` | Create content node | Content Editor+ |
| `PUT` | `/api/v1/cms/content/:id` | Update content | Content Editor+ |
| `DELETE` | `/api/v1/cms/content/:id` | Delete content | `TenantAdmin` |
| `GET` | `/api/v1/cms/navigation` | Get navigation tree | Public |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `content_editor` | Task | AI content generation, SEO optimization |
| `media_manager` | Task | Image/media validation, gallery management |
| `publish_scheduler` | Task | Content lifecycle management, expiry handling |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `cms.content_published` | `{ nodeId, contentType, slug }` | Events (audit), Communication (newsletter) |
| `cms.content_expired` | `{ nodeId, contentType }` | Events (audit) |
| `cms.content_updated` | `{ nodeId, changedFields }` | Settings (cache invalidation) |
