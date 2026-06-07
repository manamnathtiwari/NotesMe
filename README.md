<div align="center">

<img src="icons/icon128.png" width="150" alt="NotesMe"/>

# ✨ NotesMe

### Transform Every Webpage Into Your Personal Knowledge Workspace

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=22&pause=1200&color=29B6F6&center=true&vCenter=true&width=900&lines=Highlight+Important+Content;Draw+Directly+on+Any+Website;Create+Persistent+Sticky+Notes;Everything+Saves+Automatically;Your+Web%2C+Your+Annotations" />
</p>

<p align="center">

<a href="https://github.com/manamnathtiwari/NotesMe">
<img src="https://img.shields.io/github/stars/manamnathtiwari/NotesMe?style=for-the-badge&logo=github&label=Stars"/>
</a>

<img src="https://img.shields.io/badge/Manifest-V3-0F172A?style=for-the-badge"/>

<img src="https://img.shields.io/badge/Chrome-Supported-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white"/>

<img src="https://img.shields.io/badge/Edge-Supported-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white"/>

<img src="https://img.shields.io/badge/License-MIT-111827?style=for-the-badge"/>

</p>

<p align="center">
<a href="https://github.com/manamnathtiwari/NotesMe"><strong>Repository</strong></a>
•
<a href="www.linkedin.com/in/manamnathtiwari"><strong>LinkedIn</strong></a>
•
<a href="mailto:manamnathtiwari@gmail.com"><strong>Contact</strong></a>
</p>

---

## 🚀 The Problem

While reading articles, documentation, research papers, tutorials, or online courses, valuable insights often disappear the moment you close the tab.

Traditional note-taking apps force users to constantly switch between the content and their notes, breaking focus and reducing productivity.

---

## 💡 The Solution

**NotesMe creates a permanent annotation layer directly on top of any webpage.**

Instead of taking notes somewhere else, NotesMe allows users to:

* 🎨 Highlight important information
* ✏️ Draw directly on webpages
* 📝 Create sticky notes anywhere
* 💾 Automatically save everything
* 🔄 Restore annotations when revisiting

Your thoughts stay connected to the content that inspired them.

---

## 🎥 Demo

<div align="center">

### NotesMe In Action

<img src="assets/demo.gif" alt="NotesMe Demo" width="100%"/>

</div>

> Replace this GIF with a 20–30 second screen recording showing highlighting, drawing, note creation, refresh, and automatic restoration.

---

# ✨ Core Features

<table>
<tr>
<td width="33%">

### 🎨 Smart Highlighting

Highlight text across webpages with resilient anchoring.

Highlights survive:

* Refreshes
* Dynamic content
* Minor content edits
* SPA navigation

</td>

<td width="33%">

### ✏️ Freehand Drawing

Draw directly on webpages using:

* Mouse
* Touch
* Stylus
* Pen devices

Perfect for diagrams, sketches, and visual explanations.

</td>

<td width="33%">

### 📝 Sticky Notes

Drop notes anywhere.

Features:

* Drag & Move
* Auto Save
* Instant Restore
* Persistent Placement

</td>
</tr>
</table>

---

## ⚡ Built For

<div align="center">

| Users            | Use Cases                 |
| ---------------- | ------------------------- |
| 🎓 Students      | Study material annotation |
| 👨‍💻 Developers | Documentation notes       |
| 🔬 Researchers   | Paper review              |
| 📚 Readers       | Article highlighting      |
| 💼 Professionals | Knowledge management      |

</div>

---

## 🧠 Intelligent Persistence Engine

NotesMe uses multiple recovery strategies to ensure annotations remain attached to the correct content.

```text
Page Visit
   │
   ▼
Normalize URL
   │
   ▼
Generate Storage Key
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

### Reliability Features

✅ Context-based anchoring

✅ Text quote recovery

✅ MutationObserver support

✅ Retry & backoff strategy

✅ Dynamic page handling

✅ Automatic cleanup

---

## 🔒 Privacy First

Unlike many productivity tools:

* No accounts
* No analytics
* No tracking
* No third-party servers

All annotations are stored locally using:

```javascript
chrome.storage.local
```

Your data never leaves your browser.

---

## ⚙️ Installation

### Clone Repository

```bash
git clone https://github.com/manamnathtiwari/NotesMe.git
```

### Load Extension

1. Open:

```text
chrome://extensions
```

or

```text
edge://extensions
```

2. Enable **Developer Mode**
3. Click **Load Unpacked**
4. Select the NotesMe folder
5. Start annotating any webpage

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action          |
| -------- | --------------- |
| Alt + H  | Highlight Mode  |
| Alt + D  | Drawing Mode    |
| Alt + N  | Create Note     |
| Alt + S  | Toggle Sidebar  |
| Alt + T  | Toggle Toolbar  |
| Alt + Z  | Undo            |
| Alt + Y  | Redo            |
| Alt + P  | Command Palette |

---

## 📂 Project Structure

```text
NotesMe
│
├── manifest.json
├── background.js
├── content.js
├── content.css
├── popup.html
├── popup.js
│
├── icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
└── assets
    ├── demo.gif
    ├── screenshots
    └── banner.png
```

---

## 🗺️ Roadmap

### Current Progress

* [x] Highlight Engine
* [x] Drawing Layer
* [x] Sticky Notes
* [x] Sidebar
* [x] Undo / Redo
* [x] Auto Persistence
* [x] Export / Import
* [x] Sync Support

### Upcoming

* [ ] PDF Annotation
* [ ] Firefox Support
* [ ] Safari Support
* [ ] End-to-End Encryption
* [ ] AI-Powered Summaries
* [ ] Annotation Search

---

## 👨‍💻 Author

<div align="center">

### Manamnath Tiwari

Artificial Intelligence & Machine Learning Engineer

Building practical software, AI systems, developer tools, and productivity applications.

<p align="center">

<a href="https://github.com/manamnathtiwari">
<img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github"/>
</a>

<a href="www.linkedin.com/in/manamnathtiwari">
<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white"/>
</a>

<a href="mailto:manamnathtiwari@gmail.com">
<img src="https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white"/>
</a>

</p>

</div>

---

<div align="center">

## ⭐ Star This Project

If NotesMe improves your workflow, consider giving the repository a star.

It helps the project grow and supports future development.

### NotesMe — Your Web, Your Knowledge, Your Notes.

</div>
