<div align="center">

# NotesMe

**Transform every webpage into your personal knowledge workspace**

[![Stars](https://img.shields.io/github/stars/manamnathtiwari/NotesMe?style=for-the-badge&logo=github&label=Stars)](https://github.com/manamnathtiwari/NotesMe)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-0F172A?style=for-the-badge)
![Chrome](https://img.shields.io/badge/Chrome-Supported-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-Supported-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-111827?style=for-the-badge)

[Repository](https://github.com/manamnathtiwari/NotesMe) · [LinkedIn](https://linkedin.com/manamnathtiwari) · [Contact](mailto:manamnathtiwari@gmail.com)

</div>

---

## The Problem

While reading articles, documentation, research papers, or online courses — valuable insights disappear the moment you close the tab. Traditional note-taking apps force you to constantly switch context, breaking focus and reducing productivity.

## The Solution

NotesMe creates a **permanent annotation layer** directly on top of any webpage. Instead of taking notes somewhere else, your thoughts stay connected to the content that inspired them.

---

## Core Features

| Feature | Description |
|---|---|
| 🎨 **Smart Highlighting** | Highlight text with resilient anchoring that survives refreshes, dynamic content, and SPA navigation |
| ✏️ **Freehand Drawing** | Draw directly on webpages using mouse, touch, stylus, or pen devices |
| 📝 **Sticky Notes** | Drop draggable notes anywhere — they auto-save and restore exactly where you left them |
| 💾 **Auto Persistence** | Everything saves automatically and restores when you revisit the page |
| ↩️ **Undo / Redo** | Full history for all annotation types |
| 📤 **Export / Import** | Take your annotations with you |

---

## Persistence Engine

NotesMe uses multiple recovery strategies to ensure annotations remain attached to the correct content even as pages change.

```
Page Visit
    │
    ▼
Normalize URL → Generate Storage Key
    │
    ▼
Save Highlights + Notes + Drawings
    │
    ▼
User Revisits Page
    │
    ├── Offset Anchoring
    ├── Context Matching
    ├── Text Search Recovery
    └── DOM Mutation Detection
```

**Reliability features:**

- Context-based anchoring
- Text quote recovery
- MutationObserver support
- Retry & backoff strategy
- Dynamic page handling
- Automatic cleanup

---

## Privacy First

Unlike most productivity tools, NotesMe is entirely local.

- **No accounts** — nothing to sign up for
- **No analytics** — zero tracking or telemetry
- **No third-party servers** — your data never leaves your browser
- **Local storage only** — everything lives in `chrome.storage.local`

---

## Installation

**1. Clone the repository**

```bash
git clone https://github.com/manamnathtiwari/NotesMe.git
```

**2. Open extensions in your browser**

```
chrome://extensions    # Chrome
edge://extensions      # Edge
```

**3. Enable Developer Mode** (toggle in the top-right corner)

**4. Click Load Unpacked** and select the NotesMe folder

**5. Done** — visit any webpage and start annotating

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt` + `H` | Highlight mode |
| `Alt` + `D` | Drawing mode |
| `Alt` + `N` | Create new note |
| `Alt` + `S` | Toggle sidebar |
| `Alt` + `T` | Toggle toolbar |
| `Alt` + `Z` | Undo |
| `Alt` + `Y` | Redo |
| `Alt` + `P` | Command palette |

---

## Built For

| Audience | Use Case |
|---|---|
| 🎓 Students | Study material annotation |
| 👨‍💻 Developers | Documentation notes |
| 🔬 Researchers | Paper review & markup |
| 📚 Readers | Article highlighting |
| 💼 Professionals | Knowledge management |

---

## Project Structure

```
NotesMe/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── popup.html
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── assets/
    ├── demo.gif
    ├── screenshots/
    └── banner.png
```

---

## Roadmap

### Shipped

- [x] Highlight engine
- [x] Drawing layer
- [x] Sticky notes
- [x] Sidebar & toolbar
- [x] Undo / redo
- [x] Auto persistence
- [x] Export / import
- [x] Sync support

### Coming Up

- [ ] PDF annotation
- [ ] Firefox support
- [ ] Safari support
- [ ] End-to-end encryption
- [ ] AI-powered summaries
- [ ] Annotation search

---

## Author

**Manam Tiwari** — AI/ML Engineer

Building practical software, AI systems, developer tools, and productivity applications.

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github)](https://github.com/manamnathtiwari)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/manamnathtiwari)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:manamnathtiwari@gmail.com)

---

<div align="center">

If NotesMe improves your workflow, consider starring the repository — it helps the project grow.

**NotesMe — Your web, your knowledge, your notes.**

</div>