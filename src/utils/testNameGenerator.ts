export function generateTestName(userInput: string): string {
  const input = userInput.toLowerCase().trim();
  
  // Clean up the input
  let name = input
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  // Extract key actions and targets
  const actions: Record<string, string> = {
    'go to': 'Navigate to',
    'visit': 'Visit',
    'navigate': 'Navigate to',
    'click': 'Click',
    'type': 'Type',
    'enter': 'Enter',
    'search': 'Search for',
    'login': 'Login',
    'logout': 'Logout',
    'submit': 'Submit',
    'upload': 'Upload',
    'download': 'Download',
    'verify': 'Verify',
    'check': 'Check',
    'assert': 'Assert',
    'wait': 'Wait',
    'screenshot': 'Take screenshot',
    'scroll': 'Scroll',
    'hover': 'Hover',
    'drag': 'Drag',
    'select': 'Select'
  };
  
  // Try to find matching actions
  for (const [key, value] of Object.entries(actions)) {
    if (input.includes(key)) {
      const parts = input.split(key);
      const target = parts[1]?.trim();
      
      if (target) {
        // Capitalize first letter of target
        const formattedTarget = target.charAt(0).toUpperCase() + target.slice(1);
        return `${value} ${formattedTarget}`;
      } else {
        return value;
      }
    }
  }
  
  // If no specific action found, create a generic name
  if (name.length > 50) {
    name = name.substring(0, 47) + '...';
  }
  
  // Capitalize first letter
  name = name.charAt(0).toUpperCase() + name.slice(1);
  
  return name || 'Custom Test';
}

export function generateTestDescription(userInput: string): string {
  const input = userInput.trim();
  
  if (input.length <= 100) {
    return input;
  }
  
  return input.substring(0, 97) + '...';
}