# HTMLCanvas Editor

A powerful visual HTML editor built with React that enables you to create, edit, and transform HTML presentations with AI assistance.

## Features

### Visual Editing
- **Interactive Canvas** — Edit HTML directly in a visual preview mode
- **Section Management** — Extract, add, remove, duplicate, and reorder sections
- **Inline Text Editing** — Click on text elements to edit them directly
- **Style Editor** — Modify inline styles through a dedicated panel
- **Undo/Redo** — Full history navigation with unlimited undo steps
- **Zoom Control** — Adjust canvas zoom from 30% to 200%

### AI-Powered Editing
- **Smart Modifications** — Use your AI model to modify sections or full documents
- **Section Generation** — Generate new sections from descriptive prompts
- **Theme Generation** — Create new color themes for your presentation
- **Diff Preview** — View changes before applying AI suggestions

### Theme Support
- Multiple pre-built themes (Dark, Light, Gradient, etc.)
- Custom theme generation with AI
- Real-time theme preview

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run tests
npm test

# Build for production
npm build
```

## Project Structure

```
html-canvas/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── App.js              # Main application component
│   ├── index.js            # React entry point
│   ├── data/
│   │   └── index.js        # Sample HTML, themes, components
│   ├── services/
│   │   └── aiService.js    # Claude API integration
│   ├── state/
│   │   └── editorReducer.js # State management
│   └── utils/
│       ├── fileUtils.js    # File operations
│       └── html.js         # HTML parsing/manipulation utilities
├── package.json
└── README.md
```

## Usage

### Canvas Editing
- Click any editable element in the preview to modify text
- Use the left panel to manage sections (extract, add, remove, reorder)
- Use the right panel to edit styles and view properties

### AI Features
1. **Edit with AI** — Select a section and describe desired changes
2. **Generate Section** — Create new sections from a description
3. **Apply Theme** — Enter a theme description to regenerate colors

### Keyboard Shortcuts
- Standard browser shortcuts for text editing
- Zoom controls via slider in toolbar

## API Configuration

To use AI features, you'll need a Claude API key:
1. Get an API key from [Anthropic](https://www.anthropic.com/)
2. Enter it in the API key input field in the app
3. The key is stored locally in your browser

## Technologies

- **React 18** — UI framework
- **Create React App** — Build tooling
- **Jest + Testing Library** — Testing
- **Claude API** — AI-powered features

## License

utkarsh2020 — All rights reserved.