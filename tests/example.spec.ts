import { test, expect } from '@playwright/test';

test('ScriptForge homepage', async ({ page }) => {
  await page.goto('/');
  
  await expect(page).toHaveTitle(/ScriptForge/);
  
  await expect(page.locator('h1')).toContainText('ScriptForge');
  
  await expect(page.locator('.chat-messages')).toBeVisible();
  
  await expect(page.locator('#messageInput')).toBeVisible();
});