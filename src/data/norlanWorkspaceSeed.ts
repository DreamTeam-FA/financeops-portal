/**
 * Norlan's Workspace — seed data imported from Tabme backup
 * Folder/link structure mirrors the Tabme spaces exactly.
 */
import { DashboardNote } from "../types";

const d = "2026-08-22";
const m = "mem-norlan";

function fld(id: string, title: string, folderId?: string): DashboardNote {
  return { id, title, content: "", itemType: "folder", category: "General", entity: "TI", memberId: m, status: "open", createdAt: d, ...(folderId ? { folderId } : {}) };
}
function lnk(id: string, title: string, url: string, folderId?: string): DashboardNote {
  return { id, title, content: "", itemType: "link", url, category: "General", entity: "TI", memberId: m, status: "open", createdAt: d, ...(folderId ? { folderId } : {}) };
}
function note(id: string, title: string, content: string): DashboardNote {
  return { id, title, content, itemType: "note", category: "General", entity: "TI", memberId: m, status: "open", createdAt: d };
}

// Stable folder IDs
const F = {
  dashboards:   "seed-f-dashboards",
  dashGroup:    "seed-f-dash-group",
  emails:       "seed-f-emails",
  emailGroup:   "seed-f-email-group",
  spreadsheets: "seed-f-spreadsheets",
  others:       "seed-f-others",
  workflows:    "seed-f-workflows",
  cpro:         "seed-f-cpro",
  cproGroup:    "seed-f-cpro-group",
  ziglar:       "seed-f-ziglar",
  ziglarGroup:  "seed-f-ziglar-group",
  cdna:         "seed-f-cdna",
  yr4:          "seed-f-4yr",
  rubys:        "seed-f-rubys",
  g4:           "seed-f-4g",
  msdx:         "seed-f-msdx",
};

export const NORLAN_WORKSPACE_SEED: DashboardNote[] = [
  // ── Folder structure ────────────────────────────────────────────────────────
  fld(F.dashboards,   "Dashboards"),
  fld(F.dashGroup,    "GAS Dashboards",       F.dashboards),
  fld(F.emails,       "Emails & Drives"),
  fld(F.emailGroup,   "Emails",               F.emails),
  fld(F.spreadsheets, "Spreadsheets"),
  fld(F.others,       "Others"),
  fld(F.workflows,    "Workflows"),
  fld(F.cpro,         "CPRO"),
  fld(F.cproGroup,    "CPRO Sheets",          F.cpro),
  fld(F.ziglar,       "ZIGLAR"),
  fld(F.ziglarGroup,  "Ziglar Accounts",      F.ziglar),
  fld(F.cdna,         "CDNA / AI Advantage"),
  fld(F.yr4,          "4YR"),
  fld(F.rubys,        "Ruby's"),
  fld(F.g4,           "4G"),
  fld(F.msdx,         "MSDX"),

  // ── Dashboards ──────────────────────────────────────────────────────────────
  lnk("seed-l-001", "FinanceOps Portal",                    "https://financeops-portal.onrender.com/",                                                                                                                                                                      F.dashboards),
  lnk("seed-l-002", "AP Dashboard",                         "https://script.google.com/a/macros/marktimm.com/s/AKfycbyXh_Acn6eZb943b9S6xW23nw1pID9XzK39V49Yc3gT0trK1mt7HEWiv9lAgvzGncki4w/exec",                                                                         F.dashGroup),
  lnk("seed-l-003", "Finance Hub",                          "https://script.google.com/a/macros/marktimm.com/s/AKfycbzf5bwEN0WMQTFN8-6Leq0MnB46huxQAtY3DIVhgoJyOtx1Exy3EmjyHLOCzgTcaRJr/exec",                                                                          F.dashGroup),
  lnk("seed-l-004", "AR & Bank Statements Dashboard",       "https://script.google.com/macros/s/AKfycbyfYRZI2oW-0c5pCSJ8Q0Dy6lWl2vdx3PKJCbnIMb1fyCWc0ogIztZGTy6hKQPbujgx/exec",                                                                                          F.dashGroup),
  lnk("seed-l-005", "Calendar Dashboard",                   "https://script.google.com/a/macros/marktimm.com/s/AKfycbwFg-kYqd3YteiW8HAUtu7LOgzO24axIkruvNbnUgX2yulg3B3EYjkRrBpG2QIp7Wwa/exec",                                                                          F.dashGroup),
  lnk("seed-l-006", "4YR Payroll Dashboard",                "https://script.google.com/a/macros/marktimm.com/s/AKfycbxvL1T_dHYg7s2tQmlfen7Y-eeYT6cU-L3vjv8RJ51pJWu7CydOFt9YyUy0MUJesyFi/exec",                                                                          F.dashGroup),
  lnk("seed-l-007", "CurcuminPro — Ops Dashboard",         "https://script.google.com/macros/s/AKfycbx8Atk7ajk80WseNyVBuSJBjhyg8RABC5_DmeSZ2adRjkdplu0Bu5zx7yObbLrP4uT_/exec",                                                                                          F.dashboards),
  lnk("seed-l-008", "MSDx Dashboard",                      "https://script.google.com/a/macros/marktimm.com/s/AKfycbzXDYff37EY3VQKlLMNLvdT1kJJGwde9wvPllMbOtIOeKPTUunMiNg_3HVB8UV2lR_-/exec",                                                                           F.dashboards),
  lnk("seed-l-009", "Ziglar Settlement Dashboard",          "https://script.google.com/a/macros/marktimm.com/s/AKfycbwDAqUr0x8hvkVN1m3vn4CCBLw6B0AHrGQYizSAY02RSHYgxH7zCQYSy7lhfSWPcrH3/exec",                                                                          F.dashboards),
  lnk("seed-l-010", "FinanceOps Portal | Google AI Studio", "https://aistudio.google.com/apps/305c6d1d-50ed-47ff-af8b-c7317c59b1a0?showPreview=true&showAssistant=true",                                                                                                   F.dashboards),
  lnk("seed-l-011", "All Projects — Apps Script",           "https://script.google.com/home/all",                                                                                                                                                                           F.dashboards),
  lnk("seed-l-012", "FinanceOps Portal | Base44",           "https://app.base44.com/apps/6a6d89970adae62f65cf61b5/editor/preview",                                                                                                                                         F.dashboards),
  lnk("seed-l-013", "Finance Team Portal — Bolt.new",       "https://bolt.new/~/sb1-bclbcx1y",                                                                                                                                                                              F.dashboards),

  // ── Emails & Drives ─────────────────────────────────────────────────────────
  lnk("seed-l-014", "finances@marktimm.com",                "https://mail.google.com/mail/u/1/#inbox",                                                                                                                                                                      F.emailGroup),
  lnk("seed-l-015", "accounting@marktimm.com",              "https://mail.google.com/mail/u/2/#inbox",                                                                                                                                                                      F.emailGroup),
  lnk("seed-l-016", "info@mobileswallowingdx.com",          "https://mail.google.com/mail/u/3/#inbox",                                                                                                                                                                      F.emailGroup),
  lnk("seed-l-017", "2026 Scanned Receipts — Drive",        "https://drive.google.com/drive/u/0/folders/16Qje85kzbRanWgbyuB5h2tVR7J_NrZ9m",                                                                                                                               F.emails),

  // ── Spreadsheets ────────────────────────────────────────────────────────────
  lnk("seed-l-018", "F&A Monitoring Sheet",                 "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-019", "4YR Payroll",                          "https://docs.google.com/spreadsheets/d/1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-020", "Ruby's Payables",                      "https://docs.google.com/spreadsheets/d/1AhRA-IsNw1tiCdn5vLuPXdshMBkbNGUm484dfVC_q5w/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-021", "MSDx's Payables",                      "https://docs.google.com/spreadsheets/d/1hg7JFU_prws1zUcHUV9rm3al0lRHuQimAiNhD3TyJs0/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-022", "Cashflow Estimates",                    "https://docs.google.com/spreadsheets/d/18l17hoiiHDWFUC40j2FpRBmrAXBs5y5fVxb8IaJvUGI/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-023", "WEEKLY BIG 3",                         "https://docs.google.com/spreadsheets/d/12XMHZcGU898vND0ix-SCAqQkEL_S6LpzbsEC8uY5ARQ/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-024", "Credit Card Summary",                  "https://docs.google.com/spreadsheets/d/1zNCxXmc6GIfhoVCPFXwQ9V3IYmREysRtDbEjspSGlmQ/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-025", "Credit Card Summary 05.11.26",         "https://docs.google.com/spreadsheets/d/1TjZAPfqyh_cG5XHO-nwbJoVcpl-XMw5GoLR96vfhuMU/edit",                                                                                                                   F.spreadsheets),
  lnk("seed-l-026", "Lisa's Info",                          "https://docs.google.com/spreadsheets/d/1Zpc0_nNz6OiETKjX_5jq7zpddaj4Th-3B95Jy7qbXVc/edit",                                                                                                                   F.spreadsheets),

  // ── Others ──────────────────────────────────────────────────────────────────
  lnk("seed-l-027", "My LastPass Vault",                    "https://lastpass.com/vault/",                                                                                                                                                                                  F.others),
  lnk("seed-l-028", "Asana",                                "https://app.asana.com/1/1205805791583743/project/1211133949770186/list/1211139491724197",                                                                                                                       F.others),
  lnk("seed-l-029", "Slack",                                "https://app.slack.com/client/T7JSTRE3S",                                                                                                                                                                       F.others),
  lnk("seed-l-030", "Toggl Track",                          "https://track.toggl.com/timer",                                                                                                                                                                                F.others),
  lnk("seed-l-031", "Loom",                                 "https://www.loom.com/looms",                                                                                                                                                                                   F.others),
  lnk("seed-l-032", "Amazon Ads Advanced Tools Center",     "https://advertising.amazon.com/developer/overview",                                                                                                                                                             F.others),
  lnk("seed-l-033", "GoDaddy | Billing",                    "https://account.godaddy.com/receipts",                                                                                                                                                                         F.others),
  lnk("seed-l-034", "ChatGPT",                              "https://chatgpt.com/",                                                                                                                                                                                         F.others),
  lnk("seed-l-035", "INBIZ",                                "https://bsd.sos.in.gov/publicbusinesssearch",                                                                                                                                                                  F.others),
  lnk("seed-l-036", "AI Watermark Remover",                 "https://watermark.sabrina.dev/",                                                                                                                                                                               F.others),
  lnk("seed-l-037", "BotPenguin",                           "https://botpenguin.com/",                                                                                                                                                                                      F.others),
  lnk("seed-l-038", "Chatbot App",                          "https://chatbotapp.ai/pricing",                                                                                                                                                                                F.others),

  // ── Workflows ───────────────────────────────────────────────────────────────
  lnk("seed-l-039", "F&A Workflow",                         "https://docs.google.com/document/d/1McY0JUbJTqURmXtAWntos2pcl-Ttq9IMiV7aLnWHozc/edit",                                                                                                                        F.workflows),
  lnk("seed-l-040", "Ruby's Order Processing Guide v2.0",   "https://docs.google.com/document/d/1i9zi9r0aKM2YqcqOWK5fDUnLLz3hpwKzjkp26CtSNPg/edit",                                                                                                                       F.workflows),
  lnk("seed-l-041", "Ruby's Order Processing Guide",        "https://docs.google.com/document/d/1Ee9z8DNp3yXwBAbKbr_FubQ91e4jGyBCfyY4kBPWnJ8/edit",                                                                                                                       F.workflows),
  lnk("seed-l-042", "CPRO Settlement Workflow 2.0",         "https://docs.google.com/document/d/15tIgC8AGTkqvxFR7eeYH3FlOTAPBKa1-j12g95AKZgs/edit",                                                                                                                       F.workflows),
  lnk("seed-l-043", "CPRO Web/Storage Optimizer",           "https://docs.google.com/document/d/1zkyYw6Zf519gKZFAmvxTiF3tJookVxEUrTDe9WiQ11w/edit",                                                                                                                       F.workflows),
  lnk("seed-l-044", "CPRO Optimizer",                       "https://docs.google.com/document/d/1jgsU929RlzG7wrhsaHbtKPpenEbMZJmXxlLTM5k9x8E/edit",                                                                                                                       F.workflows),
  lnk("seed-l-045", "Optimizers",                           "https://docs.google.com/document/d/10TD_CzQSnX_n2J9xpjg2kL-G60f1nYmDkUrUwOsMGMA/edit",                                                                                                                       F.workflows),
  lnk("seed-l-046", "Pulling Amazon Stats — Optimizer",     "https://docs.google.com/document/d/1psrHQWnyXf-VPyyHiRz4S_2utu8_z0iRW5Wm6HU5EDc/edit",                                                                                                                       F.workflows),
  lnk("seed-l-047", "Ziglar Settlement Workflow v2.0",      "https://docs.google.com/document/d/1ic_wqDy0DE2sc_hfqb_dDa1lJJ5ZEIOWxvgj7a-Zom8/edit",                                                                                                                       F.workflows),
  lnk("seed-l-048", "Ziglar Settlement Workflow — SOP",     "https://docs.google.com/document/d/1aWAJyxuYCedOn-WHNiN76D-bW78LYOic_pD3eO39AcQ/edit",                                                                                                                       F.workflows),
  lnk("seed-l-049", "ZS: Workflow Optimizer",               "https://docs.google.com/document/d/1zTWuV7H2utwcloNEEcYVPSNnbigz1egffQaLhrNcU-s/edit",                                                                                                                       F.workflows),
  lnk("seed-l-050", "Claude Automation Prompts",            "https://docs.google.com/document/d/12qjLE8nLAqTIUPFykmr0Fg9KHi1_qWql-yV-bKf97Pk/edit",                                                                                                                       F.workflows),
  lnk("seed-l-051", "Work Schedule",                        "https://docs.google.com/spreadsheets/d/1-a43e05bwy7UoOwt3Kuf720PmAaNCPnZBegt3g9MF6I/edit",                                                                                                                   F.workflows),
  lnk("seed-l-052", "CPRO Settlement Workflow 2.0 (doc)",   "https://docs.google.com/document/d/15tIgC8AGTkqvxFR7eeYH3FlOTAPBKa1-j12g95AKZgs/edit",                                                                                                                       F.workflows),
  lnk("seed-l-053", "Ziglar Settlement Workflow v2.0 (doc)","https://docs.google.com/document/d/1ic_wqDy0DE2sc_hfqb_dDa1lJJ5ZEIOWxvgj7a-Zom8/edit",                                                                                                                       F.workflows),

  // ── CPRO ────────────────────────────────────────────────────────────────────
  lnk("seed-l-054", "CPRO Amazon Sales Report",             "https://docs.google.com/spreadsheets/d/1UK1n3sTGYpg5j7TdidpMH5HxYOtwKks5gckMWMui_XQ/edit",                                                                                                                   F.cproGroup),
  lnk("seed-l-055", "CPRO Ad Spend",                        "https://docs.google.com/spreadsheets/d/1RoYMLak4KUTglvUuKNDgQ4MoAuPB4q1Cnyy33zfHcWU/edit",                                                                                                                   F.cproGroup),
  lnk("seed-l-056", "CPRO Sales All Time",                  "https://docs.google.com/spreadsheets/d/1Vd_QvQHxuaibBW8BZt5EMZzHKDcztqXLqBNTH5DpROY/edit",                                                                                                                   F.cproGroup),
  lnk("seed-l-057", "#CURCUMINPRO HUB",                    "https://docs.google.com/spreadsheets/d/1wg2ESvNe7v9itWpsZOXiqqLSBRHnpdsZdZcNGrOE8RE/edit",                                                                                                                    F.cproGroup),
  lnk("seed-l-058", "CPRO Website & Storage 2022-2025",     "https://docs.google.com/spreadsheets/d/1H-p3QiiADLjJ2ayNemwQZnSMvGfQjlB_5bXIRk7PWKs/edit",                                                                                                                   F.cproGroup),
  lnk("seed-l-059", "CPRO Brand Payout Sheet",              "https://docs.google.com/spreadsheets/d/1WvEhME2946z-XQiuG0pTnurKvN_xCPbso3ahAAvZTTU/edit",                                                                                                                   F.cproGroup),
  lnk("seed-l-060", "CPRO Bainbridge Inventory Tracking",   "https://docs.google.com/spreadsheets/d/1hztiy7Rlncvl26XulHYF07bSlIR8OZAeXpFfzT_p-JQ/edit",                                                                                                                   F.cproGroup),
  lnk("seed-l-061", "CurcuminPro — Ops Dashboard",         "https://script.google.com/macros/s/AKfycbx8Atk7ajk80WseNyVBuSJBjhyg8RABC5_DmeSZ2adRjkdplu0Bu5zx7yObbLrP4uT_/exec",                                                                                          F.cpro),
  lnk("seed-l-062", "CPRO Settlement Workflow 2.0",         "https://docs.google.com/document/d/15tIgC8AGTkqvxFR7eeYH3FlOTAPBKa1-j12g95AKZgs/edit",                                                                                                                       F.cpro),
  lnk("seed-l-063", "Pulling Amazon Stats — Optimizer",     "https://docs.google.com/document/d/1psrHQWnyXf-VPyyHiRz4S_2utu8_z0iRW5Wm6HU5EDc/edit",                                                                                                                       F.cpro),
  lnk("seed-l-064", "Amazon Seller Central",                "https://sellercentral.amazon.com/business-reports/ref=xx_sitemetric_dnav_xx#/dashboard",                                                                                                                       F.cpro),
  lnk("seed-l-065", "WooCommerce",                          "https://curcuminpro.com/wp-admin/admin.php?page=wc-admin&path=%2Fanalytics%2Forders",                                                                                                                          F.cpro),
  lnk("seed-l-066", "Klaviyo",                              "https://www.klaviyo.com/dashboard",                                                                                                                                                                            F.cpro),

  // ── ZIGLAR ──────────────────────────────────────────────────────────────────
  lnk("seed-l-067", "2026 Ziglar Settlement",               "https://docs.google.com/spreadsheets/d/1W6_NhWbujbd1NEw01PlypKc9B-Pa4EFVoEg6wp6jZ3k/edit",                                                                                                                   F.ziglarGroup),
  lnk("seed-l-068", "Coaching Sales",                       "https://docs.google.com/spreadsheets/d/1U39OlfmTDKDTy5uojrOAAnmz27uNTuIwMRLiNJNC168/edit",                                                                                                                   F.ziglarGroup),
  lnk("seed-l-069", "LightSpeed VT",                        "https://lsvtlogin.lightspeedvt.com/",                                                                                                                                                                          F.ziglarGroup),
  lnk("seed-l-070", "Ziglar, Inc · Shopify Orders",         "https://admin.shopify.com/store/ziglar-black-friday-sale/orders",                                                                                                                                              F.ziglarGroup),
  lnk("seed-l-071", "Timm Investments (GoHighLevel)",       "https://app.gohighlevel.com/v2/location/Ux13i3hxBrDImOGx3qbz/dashboard",                                                                                                                                      F.ziglarGroup),
  lnk("seed-l-072", "Keap",                                 "https://app.infusionsoft.com/core/app/nav/link?navSystem=nav.mynav&navModule=nav.home.dashboard",                                                                                                              F.ziglarGroup),
  lnk("seed-l-073", "Ziglar Settlement Dashboard",          "https://script.google.com/a/macros/marktimm.com/s/AKfycbwDAqUr0x8hvkVN1m3vn4CCBLw6B0AHrGQYizSAY02RSHYgxH7zCQYSy7lhfSWPcrH3/exec",                                                                          F.ziglar),
  lnk("seed-l-074", "Ziglar Settlement Workflow — SOP",     "https://docs.google.com/document/d/1aWAJyxuYCedOn-WHNiN76D-bW78LYOic_pD3eO39AcQ/edit",                                                                                                                       F.ziglar),
  lnk("seed-l-075", "ZS: Workflow Optimizer",               "https://docs.google.com/document/d/1zTWuV7H2utwcloNEEcYVPSNnbigz1egffQaLhrNcU-s/edit",                                                                                                                       F.ziglar),
  lnk("seed-l-076", "Ziglar Settlement Workflow v2.0",      "https://docs.google.com/document/d/1ic_wqDy0DE2sc_hfqb_dDa1lJJ5ZEIOWxvgj7a-Zom8/edit",                                                                                                                       F.ziglar),
  lnk("seed-l-077", "ZIGLAR SHOPIFY APPS REVIEW",           "https://docs.google.com/spreadsheets/d/10pNinN2Gnuc15ntahGS2ZqyYCnhSoOyEDGHZgqKdPQ4/edit",                                                                                                                   F.ziglar),
  lnk("seed-l-078", "Ziglar Inc — WordPress",               "https://www.ziglar.com/wp-admin/",                                                                                                                                                                             F.ziglar),

  // ── CDNA / AI Advantage ─────────────────────────────────────────────────────
  lnk("seed-l-079", "Airtable",                             "https://airtable.com/appkLC0YAdmyOgLTi/tbl52FvrhnOaTmtpD/viwH0YprSFqQjITRJ?blocks=hide",                                                                                                                     F.cdna),
  lnk("seed-l-080", "CL — Masterminds (Drive)",             "https://drive.google.com/drive/folders/1InC7YZziPwPYEdoqci9BFitDhxroHh8q",                                                                                                                                    F.cdna),
  lnk("seed-l-081", "AI Advantage — Dropbox",               "https://www.dropbox.com/home/Ai%20Advantage",                                                                                                                                                                 F.cdna),
  lnk("seed-l-082", "Molly Mahoney Resources",              "https://drive.google.com/drive/u/0/folders/1hPJuwGTpw4zdf75HfTEVvMa1pwFBL6aj",                                                                                                                               F.cdna),
  lnk("seed-l-083", "Hack of The Week | AI Advantage Club", "https://community.aiadvantage.com/c/hack-of-the-week",                                                                                                                                                        F.cdna),

  // ── 4YR ─────────────────────────────────────────────────────────────────────
  lnk("seed-l-084", "4YR Payroll",                          "https://docs.google.com/spreadsheets/d/1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE/edit",                                                                                                                   F.yr4),
  lnk("seed-l-085", "Sinc Console",                         "https://users.sinc.business/mysinc/employee-shifts/details/-Oo_r7fFF_RZVUvM8S7o",                                                                                                                             F.yr4),

  // ── Ruby's ──────────────────────────────────────────────────────────────────
  lnk("seed-l-086", "Ruby's Order Processing Guide",        "https://docs.google.com/document/d/1Ee9z8DNp3yXwBAbKbr_FubQ91e4jGyBCfyY4kBPWnJ8/edit",                                                                                                                       F.rubys),
  lnk("seed-l-087", "Ruby's Order Processing Guide v2.0",   "https://docs.google.com/document/d/1i9zi9r0aKM2YqcqOWK5fDUnLLz3hpwKzjkp26CtSNPg/edit",                                                                                                                       F.rubys),
  lnk("seed-l-088", "Feeding the Athletes — Orders",        "https://docs.google.com/spreadsheets/d/1FvscPcijHOZHDj6G_VGCeYa9WI_HPMnwlmTkLSxGOo4/edit",                                                                                                                   F.rubys),
  lnk("seed-l-089", "Ruby's Payables",                      "https://docs.google.com/spreadsheets/d/1AhRA-IsNw1tiCdn5vLuPXdshMBkbNGUm484dfVC_q5w/edit",                                                                                                                   F.rubys),
  lnk("seed-l-090", "Toast Recon",                          "https://docs.google.com/spreadsheets/d/1cTKsnNSm6VzNnXYlQUyXbHSEt7Odx0VtAAk1Dcpy_aM/edit",                                                                                                                   F.rubys),
  lnk("seed-l-091", "Ruby's Toast Recon Report",            "https://docs.google.com/document/d/1OHS1TmkpE1Hk-ukUaHZB3C0PSdCHsSIaS19YAqZeqJs/edit",                                                                                                                       F.rubys),
  lnk("seed-l-092", "Toast (website)",                      "https://www.toasttab.com/restaurants/admin/reports/payments/payouts",                                                                                                                                          F.rubys),
  lnk("seed-l-093", "Zions First National Bank",            "https://digital.zionsbank.com/",                                                                                                                                                                               F.rubys),

  // ── 4G ──────────────────────────────────────────────────────────────────────
  lnk("seed-l-094", "4Grace CC Expense Template",           "https://docs.google.com/spreadsheets/d/1gKCKrWw8mkqJDiRl_9xYIhkzmtjOEoauQZgbtW9gIew/edit",                                                                                                                   F.g4),

  // ── MSDX ────────────────────────────────────────────────────────────────────
  lnk("seed-l-095", "MSDx's Payables",                      "https://docs.google.com/spreadsheets/d/1hg7JFU_prws1zUcHUV9rm3al0lRHuQimAiNhD3TyJs0/edit",                                                                                                                   F.msdx),
  lnk("seed-l-096", "Monday.com",                           "https://radxcel.monday.com/boards/18396670485",                                                                                                                                                                F.msdx),
  lnk("seed-l-097", "MSDx Dashboard",                       "https://script.google.com/a/macros/marktimm.com/s/AKfycbzXDYff37EY3VQKlLMNLvdT1kJJGwde9wvPllMbOtIOeKPTUunMiNg_3HVB8UV2lR_-/exec",                                                                           F.msdx),
  lnk("seed-l-098", "MSDx GAS Editor",                      "https://script.google.com/home/projects/14QHpkuTxKBtHoHTi8bUGOfFEvdz1BSLUJZB77ftSAB6OHjZnzD83sKk_/edit",                                                                                                     F.msdx),

  // ── Sticker notes (from Tabme widgets) ──────────────────────────────────────
  note("seed-n-001", "✅ CHECK ALWAYS",
    "1. Airgas Portal\n2. Alsco Portal\n3. Keystone Portal\n4. Parke County Portal (VPN)\n5. US Foods Portal (VPN)"),
  note("seed-n-002", "📧 CHECK EMAIL",
    "1. Cache Valley\n2. Headley's\n3. MXR Imaging"),
];
