# ScriptForge

🤖 **_Where conversations become test automation_**

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.41.0-45ba4b)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

ScriptForge is an intelligent test automation platform that transforms natural language conversations into production-ready Playwright scripts. By combining the power of conversational AI with Playwright's robust browser automation capabilities, ScriptForge enables both technical and non-technical team members to create, maintain, and scale automated tests through simple chat interactions.

## 🌟 Why ScriptForge?

- **Natural Language to Code**: Simply describe what you want to test in plain English
- **No Coding Required**: Perfect for QA engineers, product managers, and business analysts
- **Production-Ready Scripts**: Generates clean, maintainable Playwright TypeScript code
- **Instant Feedback**: See your tests being created in real-time as you chat
- **Team Collaboration**: Share and manage test scripts across your organization

## Features

- 🤖 **Conversational AI**: Chat with ScriptForge to describe what you want to test
- 🧠 **AI-Powered Script Generation**: Leverages AI to generate complete, intelligent test scripts
- 🎭 **Playwright Integration**: Generates production-ready Playwright TypeScript test scripts
- 🔄 **Real-time Generation**: Watch your tests being created as you chat
- 📝 **Script Management**: Save, organize, and download your generated scripts
- ✅ **Validation & Execution**: Validate and run your scripts directly from the platform
- 💡 **Smart Suggestions**: Get intelligent recommendations to improve your tests
- 🎯 **Context-Aware Generation**: Analyzes target pages to use accurate selectors
- 🔍 **Page Analysis**: Automatically discovers elements and forms on web pages
- 🤝 **Multiple AI Providers**: Supports both Anthropic Claude and Google Gemini

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- MongoDB (local installation or MongoDB Atlas account)
- AI Provider API key (Anthropic Claude or Google Gemini)

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

4. Set up MongoDB:
   - **Option 1: Local MongoDB**
     ```bash
     # Install MongoDB locally (if not already installed)
     # macOS: brew install mongodb-community
     # Ubuntu: sudo apt-get install mongodb
     # Start MongoDB service
     ```
   
   - **Option 2: MongoDB Atlas (Cloud)**
     - Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
     - Create a cluster and get your connection string

5. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add:
# - Your AI Provider API key (Anthropic or Google Gemini)
# - MongoDB connection string (local or Atlas)
```

6. Build the project:
```bash
npm run build
```

7. Start the development server:
```bash
npm run dev
```

8. Open your browser and navigate to `http://localhost:3000`

## Usage

### Getting Started

1. Open ScriptForge in your browser at `http://localhost:3000`
2. Start a new conversation in the chat interface
3. Describe your test scenario in natural language
4. Review the generated Playwright script
5. Save, validate, or execute your script

### Basic Commands

Try these conversational commands with ScriptForge:

#### Navigation
- "Go to google.com"
- "Navigate to https://example.com"
- "Open a new tab and go to github.com"

#### Interactions
- "Click the login button"
- "Click on the element with text 'Sign Up'"
- "Right-click on the menu icon"
- "Double-click the submit button"

#### Form Input
- "Type 'hello world' in the search box"
- "Enter 'user@example.com' in the email field"
- "Select 'United States' from the country dropdown"
- "Check the 'I agree' checkbox"

#### Assertions
- "Check that the page title contains 'Welcome'"
- "Verify the login button is visible"
- "Assert that the error message says 'Invalid credentials'"
- "Ensure the URL contains '/dashboard'"

#### Page Actions
- "Take a screenshot"
- "Take a full page screenshot named 'homepage'"
- "Wait for 3 seconds"
- "Wait for the loading spinner to disappear"
- "Scroll to the bottom of the page"

### Advanced Examples

#### E-commerce Testing
```
"Go to amazon.com, search for 'wireless headphones', click on the first result, 
add it to cart, then verify the cart count shows '1'"
```

#### Login Flow Testing
```
"Navigate to myapp.com/login, enter 'testuser@example.com' in the email field, 
type 'securepass123' in the password field, click the login button, 
wait for navigation, then verify the dashboard page is displayed"
```

#### Form Validation Testing
```
"Go to the registration page, leave all fields empty, click submit, 
and verify that error messages appear for required fields"
```

## API Endpoints

### Chat API
- `POST /api/chat/message` - Send a message and get script generation
- `GET /api/chat/conversation/:id` - Get conversation history
- `POST /api/chat/analyze-page` - Analyze a web page to discover elements and forms
- `POST /api/chat/suggest-elements` - Get element suggestions for specific actions

### Scripts API
- `GET /api/scripts` - List all scripts
- `POST /api/scripts` - Create a new script
- `GET /api/scripts/search?q=query` - Search scripts by name, description, or tags
- `GET /api/scripts/executions/all` - Get all execution history
- `GET /api/scripts/:id` - Get a specific script
- `PUT /api/scripts/:id` - Update a script
- `DELETE /api/scripts/:id` - Delete a script
- `POST /api/scripts/:id/execute` - Execute a script
- `POST /api/scripts/:id/validate` - Validate a script
- `GET /api/scripts/:id/download` - Download script as .ts file
- `GET /api/scripts/:id/executions` - Get execution history for a script
- `GET /api/scripts/:id/stats` - Get execution statistics for a script

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic Claude API key (preferred AI provider)
- `GEMINI_API_KEY` - Your Google Gemini API key (fallback AI provider)
- `MONGODB_URI` - MongoDB connection string (default: mongodb://localhost:27017/scriptforge)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Playwright Configuration

The project includes a `playwright.config.ts` file with sensible defaults. You can customize:
- Browser types (Chromium, Firefox, WebKit)
- Test timeouts and retries
- Screenshots and video recording
- Base URL for tests

## Architecture

ScriptForge follows a clean, modular architecture with MongoDB integration:

```
src/
├── controllers/         # Express route controllers
│   ├── ChatController.ts    # Handles chat interactions and API endpoints
│   └── ScriptController.ts  # Manages script operations
├── models/             # MongoDB Mongoose models
│   ├── Script.ts          # Script schema and model
│   └── Execution.ts       # Execution history schema
├── services/           # Business logic services
│   ├── NLPService.ts         # Natural language processing with AI providers
│   ├── ContextAwareNLPService.ts # Enhanced NLP with page context
│   ├── PageAnalyzerService.ts    # Web page analysis and element discovery
│   ├── database.ts           # MongoDB connection service
│   ├── ScriptGeneratorService.ts # AI-powered script generation
│   ├── ScriptExecutorService.ts  # Script execution logic
│   └── ScriptStorageService.ts   # MongoDB data operations
├── types/              # TypeScript type definitions
│   └── index.ts           # Core type definitions
└── utils/              # Utility functions
    └── testNameGenerator.ts # Test naming utilities

public/                 # Static web assets
├── css/                  # Stylesheets
├── js/                   # Client-side JavaScript
└── index.html           # Main application UI

tests/                  # Playwright test files
temp/                   # Temporary script execution files
```

### Data Storage

ScriptForge uses MongoDB for persistent storage:

- **Scripts Collection**: Stores test scripts with metadata
- **Executions Collection**: Stores execution history and results
- **Indexed Fields**: Optimized queries for search and filtering
- **Full-text Search**: Search across script names, descriptions, and tags

## Development

### Prerequisites for Development

- Node.js 18+ and npm
- TypeScript knowledge (helpful but not required)
- Basic understanding of Playwright
- AI Provider API key (Anthropic Claude or Google Gemini)

### Setting Up Development Environment

1. Install dependencies:
```bash
npm install
```

2. Set up pre-commit hooks (optional):
```bash
npm run prepare
```

3. Start development server with hot reload:
```bash
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in headed mode
npm run test:headed

# Run specific test file
npx playwright test tests/example.spec.ts

# Run tests with UI mode
npx playwright test --ui
```

### Development Scripts

```bash
npm run dev        # Start development server with hot reload
npm run build      # Build TypeScript to JavaScript
npm start          # Start production server
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Creating Custom Commands

You can extend ScriptForge's command understanding by modifying the AI prompt in `src/services/NLPService.ts`. The system uses a structured prompt template that maps natural language to Playwright actions.

## Troubleshooting

### Common Issues

#### AI Provider API Key Issues
- **Error**: "No AI provider API key found"
  - **Solution**: Ensure either `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set in the `.env` file
  - **Note**: API keys should not contain quotes or spaces
  - **Preference**: If both keys are present, Anthropic will be used by default

#### Playwright Installation Issues
- **Error**: "Browser executable not found"
  - **Solution**: Run `npx playwright install` to download browser binaries
  - **Note**: This requires internet connection and may take a few minutes

#### Script Execution Failures
- **Error**: "Script execution timeout"
  - **Solution**: Increase timeout in `playwright.config.ts` or add explicit waits in your commands
  - **Example**: Instead of "Click login", try "Wait for login button to be visible, then click it"

#### Port Already in Use
- **Error**: "EADDRINUSE: address already in use"
  - **Solution**: Change the port in `.env` file or kill the process using the port
  - **Command**: `lsof -ti:3000 | xargs kill -9` (on macOS/Linux)

#### MongoDB Connection Issues
- **Error**: "Failed to connect to MongoDB"
  - **Solution**: Ensure MongoDB is running locally or check your Atlas connection string
  - **Local**: Start MongoDB service with `mongod` or `brew services start mongodb-community`
  - **Atlas**: Verify IP whitelist settings and credentials

### Best Practices

1. **Be Specific**: The more specific your commands, the better the generated scripts
2. **Use Selectors**: When possible, mention specific selectors or element text
3. **Add Waits**: Include wait conditions for dynamic content
4. **Validate Often**: Use the validate feature before executing scripts
5. **Save Progress**: Save your scripts frequently during development

## Advanced Features

### Context-Aware Test Generation

ScriptForge now analyzes target web pages before generating tests, ensuring accurate selector generation:

- **Automatic Page Analysis**: Discovers all interactive elements, forms, and their properties
- **Smart Selector Generation**: Prioritizes reliable selectors (data-testid > ID > unique classes)
- **Form Detection**: Automatically identifies form fields and submit buttons
- **Element Validation**: Ensures elements are visible and interactive before generating actions

### Custom Selectors

ScriptForge supports various selector strategies:

```
"Click the button with id 'submit-btn'"
"Click the element with class 'primary-button'"
"Click the button containing text 'Submit'"
"Click the third item in the list with class 'menu-items'"
```

### Conditional Actions

You can create conditional test flows:

```
"If the cookie banner is visible, click 'Accept All', then continue with the login flow"
"Check if the user is already logged in, if not, go to login page"
```

### Data-Driven Testing

Generate scripts with parameterized data:

```
"Create a test that logs in with different user credentials from a list"
"Test the search functionality with multiple search terms"
```

### Browser Context

Control browser behavior:

```
"Open in incognito mode"
"Set the viewport to mobile size (375x667)"
"Enable JavaScript debugging"
"Block all images to speed up the test"
```

## Performance Tips

1. **Minimize Screenshots**: Only capture screenshots when necessary
2. **Use Headless Mode**: Run faster by using headless browser mode
3. **Parallel Execution**: Run multiple scripts in parallel for faster test suites
4. **Smart Waits**: Use `waitForSelector` instead of fixed delays
5. **Resource Blocking**: Block unnecessary resources like ads or analytics

## Roadmap

- [ ] Support for more AI providers (OpenAI, Anthropic)
- [ ] Visual test recorder
- [ ] Test data management
- [ ] CI/CD integration templates
- [ ] Multi-language script generation
- [ ] Team collaboration features
- [ ] Test reporting dashboard
- [ ] Mobile app testing support

## Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write clean, documented code
- Add tests for new features
- Update documentation as needed
- Follow the existing code style
- Ensure all tests pass before submitting PR

## License

This project is licensed under the ISC License.

## Support

- 📧 **Email**: support@scriptforge.dev
- 💬 **Discord**: [Join our community](https://discord.gg/scriptforge)
- 📖 **Documentation**: [docs.scriptforge.dev](https://docs.scriptforge.dev)
- 🐛 **Issues**: [GitHub Issues](https://github.com/your-username/scriptforge/issues)


## Acknowledgments

- Built with [Playwright](https://playwright.dev/) for reliable browser automation
- Powered by [Anthropic Claude](https://www.anthropic.com/) and [Google Gemini](https://deepmind.google/technologies/gemini/) for natural language understanding
- Inspired by the need for accessible test automation

## Changelog

### Latest Updates
- **AI-Powered Script Generation**: Completely delegated script generation to AI for more intelligent and flexible test creation
- **Context-Aware Generation**: Added intelligent page analysis for accurate selector generation
- **Multiple AI Providers**: Added support for Anthropic Claude (default) and Google Gemini
- **Enhanced Error Handling**: Improved error messages and fallback mechanisms
- **Better Selector Generation**: Fixed issues with generic selectors like 'body'
- **Code Cleanup**: Removed unused functions and optimized codebase

---

Made with ❤️ by the ScriptForge Team 
