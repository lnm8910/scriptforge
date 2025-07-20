# ScriptForge

Where conversations become test automation

ScriptForge is an intelligent test automation platform that transforms natural language conversations into production-ready Playwright scripts. By combining the power of conversational AI with Playwright's robust browser automation capabilities, ScriptForge enables both technical and non-technical team members to create, maintain, and scale automated tests through simple chat interactions.

## Features

- 🤖 **Conversational AI**: Chat with ScriptForge to describe what you want to test
- 🎭 **Playwright Integration**: Generates production-ready Playwright TypeScript test scripts
- 🔄 **Real-time Generation**: Watch your tests being created as you chat
- 📝 **Script Management**: Save, organize, and download your generated scripts
- ✅ **Validation & Execution**: Validate and run your scripts directly from the platform
- 💡 **Smart Suggestions**: Get intelligent recommendations to improve your tests

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/scriptforge.git
cd scriptforge
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your Google Gemini API key
```

5. Build the project:
```bash
npm run build
```

6. Start the development server:
```bash
npm run dev
```

7. Open your browser and navigate to `http://localhost:3000`

## Usage

### Basic Examples

Try these conversational commands with ScriptForge:

- **Navigation**: "Go to google.com"
- **Interactions**: "Click the login button"
- **Form Input**: "Type 'hello world' in the search box"
- **Assertions**: "Check that the page title contains 'Welcome'"
- **Screenshots**: "Take a screenshot"
- **Waiting**: "Wait for 3 seconds"

### Advanced Examples

- "Navigate to github.com, click on sign in, enter username 'testuser' and password 'testpass', then verify the dashboard is visible"
- "Go to the shopping site, search for 'laptop', click on the first result, and take a screenshot"

## API Endpoints

### Chat API
- `POST /api/chat/message` - Send a message and get script generation
- `GET /api/chat/conversation/:id` - Get conversation history

### Scripts API
- `GET /api/scripts` - List all scripts
- `POST /api/scripts` - Create a new script
- `GET /api/scripts/:id` - Get a specific script
- `PUT /api/scripts/:id` - Update a script
- `DELETE /api/scripts/:id` - Delete a script
- `POST /api/scripts/:id/execute` - Execute a script
- `POST /api/scripts/:id/validate` - Validate a script
- `GET /api/scripts/:id/download` - Download script as .ts file

## Configuration

### Environment Variables

- `GEMINI_API_KEY` - Your Google Gemini API key for natural language processing
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Playwright Configuration

The project includes a `playwright.config.ts` file with sensible defaults. You can customize:
- Browser types (Chromium, Firefox, WebKit)
- Test timeouts and retries
- Screenshots and video recording
- Base URL for tests

## Development

### Project Structure

```
src/
├── controllers/     # Express route controllers
├── services/        # Business logic services
├── types/          # TypeScript type definitions
└── utils/          # Utility functions

public/             # Static web assets
tests/              # Playwright test files
temp/               # Temporary script execution files
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in headed mode
npm run test:headed

# Run specific test file
npx playwright test tests/example.spec.ts
```

### Development Scripts

```bash
npm run dev        # Start development server with hot reload
npm run build      # Build TypeScript to JavaScript
npm start          # Start production server
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/your-username/scriptforge/issues) on GitHub. 
