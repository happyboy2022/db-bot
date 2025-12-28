import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3008';
const TEST_USER = {
  email: 'admin@localhost.dev',
  password: 'admin123456'
};

const issues = [];
const screenshots = [];

function logIssue(page, category, description, severity = 'medium') {
  issues.push({ page, category, description, severity });
  console.log(`  ❌ [${severity.toUpperCase()}] ${category}: ${description}`);
}

function logSuccess(description) {
  console.log(`  ✅ ${description}`);
}

async function takeScreenshot(page, name) {
  const path = `/tmp/e2e-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push({ name, path });
  return path;
}

async function testLoginPage(page) {
  console.log('\n📄 Testing Login Page...');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await takeScreenshot(page, 'login-page');

  // Check page title
  const title = await page.title();
  if (title) {
    logSuccess(`Page title: "${title}"`);
  } else {
    logIssue('/login', 'SEO', 'Missing page title', 'low');
  }

  // Check form elements
  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  const submitButton = page.locator('button[type="submit"]');

  if (await emailInput.count() === 0) {
    logIssue('/login', 'Form', 'Email input not found', 'high');
  } else {
    logSuccess('Email input found');
  }

  if (await passwordInput.count() === 0) {
    logIssue('/login', 'Form', 'Password input not found', 'high');
  } else {
    logSuccess('Password input found');
  }

  if (await submitButton.count() === 0) {
    logIssue('/login', 'Form', 'Submit button not found', 'high');
  } else {
    logSuccess('Submit button found');
  }

  // Check for register link
  const registerLink = page.locator('a[href="/register"]');
  if (await registerLink.count() === 0) {
    logIssue('/login', 'Navigation', 'Register link not found', 'medium');
  } else {
    logSuccess('Register link found');
  }

  // Test login functionality
  console.log('\n  Testing login functionality...');
  await emailInput.fill(TEST_USER.email);
  await passwordInput.fill(TEST_USER.password);
  await takeScreenshot(page, 'login-filled');

  await submitButton.click();

  // Wait for navigation or error message (longer timeout for slow auth)
  try {
    await page.waitForURL(/\/(requests|dashboard|pending|forbidden)/, { timeout: 15000 });
  } catch (e) {
    // Navigation didn't happen, check for error
  }

  const currentUrl = page.url();
  if (currentUrl.includes('/requests') || currentUrl.includes('/dashboard')) {
    logSuccess(`Login successful - redirected to ${currentUrl}`);
    return true;
  } else {
    // Check for error message
    const errorDiv = page.locator('.bg-red-50, .bg-destructive');
    if (await errorDiv.count() > 0) {
      const errorText = await errorDiv.first().textContent();
      logIssue('/login', 'Auth', `Login failed: ${errorText}`, 'high');
    } else {
      logIssue('/login', 'Auth', 'Login failed - no redirect or error message', 'high');
    }
    await takeScreenshot(page, 'login-failed');
    return false;
  }
}

async function testRequestsPage(page) {
  console.log('\n📄 Testing Requests Page...');

  await page.goto(`${BASE_URL}/requests`, { waitUntil: 'networkidle', timeout: 30000 });
  await takeScreenshot(page, 'requests-page');

  // Check page structure
  const pageTitle = page.locator('h1, h2').first();
  if (await pageTitle.count() > 0) {
    const titleText = await pageTitle.textContent();
    logSuccess(`Page title: "${titleText}"`);
  }

  // Check for New Request button
  const newRequestBtn = page.locator('a[href="/requests/new"], button:has-text("新建请求"), button:has-text("New Request")');
  if (await newRequestBtn.count() > 0) {
    logSuccess('New Request button found');
  } else {
    logIssue('/requests', 'UI', 'New Request button not found', 'medium');
  }

  // Check filters
  const statusFilter = page.locator('select, [role="combobox"]').first();
  if (await statusFilter.count() > 0) {
    logSuccess('Filter controls found');
  }

  // Check sidebar navigation
  const sidebarLinks = await page.locator('nav a, aside a').all();
  console.log(`  Found ${sidebarLinks.length} navigation links`);

  return true;
}

async function testNewRequestPage(page) {
  console.log('\n📄 Testing New Request Page...');

  await page.goto(`${BASE_URL}/requests/new`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000); // Wait for CodeMirror to initialize
  await takeScreenshot(page, 'new-request-page');

  // Check for errors on page
  const errorOverlay = page.locator('.error-overlay, [class*="Runtime Error"]');
  if (await errorOverlay.count() > 0) {
    logIssue('/requests/new', 'Runtime', 'Runtime error detected on page', 'critical');
    return false;
  }

  // Check form elements
  const titleInput = page.locator('input[name="title"], input[id="title"]');
  if (await titleInput.count() > 0) {
    logSuccess('Title input found');
  } else {
    logIssue('/requests/new', 'Form', 'Title input not found', 'high');
  }

  // Check for SQL editor (CodeMirror)
  const sqlEditor = page.locator('.cm-editor, [class*="codemirror"]');
  if (await sqlEditor.count() > 0) {
    logSuccess('SQL Editor (CodeMirror) found');
  } else {
    logIssue('/requests/new', 'Component', 'SQL Editor not found', 'high');
  }

  // Check service selector
  const serviceSelector = page.locator('select[name="service"], [name="serviceId"]');
  if (await serviceSelector.count() > 0) {
    logSuccess('Service selector found');
  }

  // Check submit button (the form's submit, not logout button)
  const submitBtn = page.locator('button[type="submit"]:has-text("创建请求"), button[type="submit"]:has-text("Create")');
  if (await submitBtn.count() > 0) {
    logSuccess('Submit button found');
    const isDisabled = await submitBtn.first().isDisabled();
    if (isDisabled) {
      logSuccess('Submit button correctly disabled when form is empty');
    }
  } else {
    // Check for any submit button in the form area
    const formSubmit = page.locator('form button[type="submit"]');
    if (await formSubmit.count() > 0) {
      logSuccess('Form submit button found');
    } else {
      logIssue('/requests/new', 'Form', 'Submit button not found', 'high');
    }
  }

  return true;
}

async function testAdminPages(page) {
  console.log('\n📄 Testing Admin Pages...');

  const adminPages = [
    { path: '/admin/users', name: 'Users Management' },
    { path: '/admin/approvals', name: 'Approvals' },
    { path: '/admin/templates', name: 'Templates' },
    { path: '/admin/sessions', name: 'Sessions' },
    { path: '/admin/audit', name: 'Audit Logs' },
  ];

  for (const adminPage of adminPages) {
    console.log(`\n  Testing ${adminPage.name} (${adminPage.path})...`);

    try {
      await page.goto(`${BASE_URL}${adminPage.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await takeScreenshot(page, `admin-${adminPage.path.replace(/\//g, '-')}`);

      // Check if redirected to forbidden
      if (page.url().includes('/forbidden')) {
        logIssue(adminPage.path, 'Access', 'Redirected to forbidden page', 'medium');
        continue;
      }

      // Check for error overlays
      const errorOverlay = page.locator('[class*="error"], [class*="Error"]').first();
      const hasError = await errorOverlay.count() > 0;

      if (hasError) {
        const errorText = await errorOverlay.textContent();
        if (errorText?.includes('Runtime Error') || errorText?.includes('Error')) {
          logIssue(adminPage.path, 'Runtime', `Error on page: ${errorText.substring(0, 100)}`, 'high');
          continue;
        }
      }

      logSuccess(`${adminPage.name} page loaded successfully`);

    } catch (error) {
      logIssue(adminPage.path, 'Network', `Failed to load: ${error.message}`, 'high');
    }
  }

  return true;
}

async function testRegisterPage(page) {
  console.log('\n📄 Testing Register Page...');

  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle', timeout: 30000 });
  await takeScreenshot(page, 'register-page');

  // Check form elements
  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  const displayNameInput = page.locator('input[name="displayName"]');
  const submitButton = page.locator('button[type="submit"]');

  if (await emailInput.count() > 0) logSuccess('Email input found');
  else logIssue('/register', 'Form', 'Email input not found', 'high');

  if (await passwordInput.count() > 0) logSuccess('Password input found');
  else logIssue('/register', 'Form', 'Password input not found', 'high');

  if (await displayNameInput.count() > 0) logSuccess('Display name input found');

  if (await submitButton.count() > 0) logSuccess('Submit button found');
  else logIssue('/register', 'Form', 'Submit button not found', 'high');

  // Check for login link
  const loginLink = page.locator('a[href="/login"]');
  if (await loginLink.count() > 0) {
    logSuccess('Login link found');
  } else {
    logIssue('/register', 'Navigation', 'Login link not found', 'medium');
  }

  return true;
}

async function testResponsiveness(page) {
  console.log('\n📱 Testing Responsiveness...');

  const viewports = [
    { width: 1920, height: 1080, name: 'desktop-large' },
    { width: 1280, height: 720, name: 'desktop' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 375, height: 667, name: 'mobile' },
  ];

  await page.goto(`${BASE_URL}/requests`, { waitUntil: 'networkidle', timeout: 30000 });

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(500);
    await takeScreenshot(page, `responsive-${viewport.name}`);

    // Check if sidebar is visible on desktop, hidden on mobile
    const sidebar = page.locator('aside, nav[class*="sidebar"]');
    const sidebarVisible = await sidebar.isVisible().catch(() => false);

    if (viewport.width < 768 && sidebarVisible) {
      // On mobile, sidebar should be hidden or toggleable
      logSuccess(`${viewport.name}: Sidebar behavior OK`);
    } else if (viewport.width >= 768 && sidebarVisible) {
      logSuccess(`${viewport.name}: Sidebar visible`);
    }
  }

  // Reset to desktop
  await page.setViewportSize({ width: 1280, height: 720 });

  return true;
}

async function testConsoleErrors(page) {
  console.log('\n🔍 Checking for Console Errors...');

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const pagesToCheck = [
    '/login',
    '/register',
    '/requests',
    '/requests/new',
    '/admin/users',
  ];

  for (const path of pagesToCheck) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  if (consoleErrors.length > 0) {
    console.log(`  Found ${consoleErrors.length} console errors:`);
    consoleErrors.slice(0, 5).forEach(err => {
      if (!err.includes('404') && !err.includes('favicon')) {
        logIssue('Multiple', 'Console', err.substring(0, 100), 'medium');
      }
    });
  } else {
    logSuccess('No significant console errors found');
  }

  return true;
}

async function test404Errors(page) {
  console.log('\n🔍 Checking for 404 Errors...');

  const notFoundRequests = [];
  page.on('response', response => {
    if (response.status() === 404) {
      notFoundRequests.push(response.url());
    }
  });

  await page.goto(`${BASE_URL}/requests`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  if (notFoundRequests.length > 0) {
    console.log(`  Found ${notFoundRequests.length} 404 errors:`);
    notFoundRequests.forEach(url => {
      if (!url.includes('favicon')) {
        logIssue('/requests', '404', `Resource not found: ${url}`, 'medium');
      }
    });
  } else {
    logSuccess('No 404 errors found');
  }

  return true;
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         E2E Testing - SQL Ops Console                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Test login first
    const loginSuccess = await testLoginPage(page);

    if (loginSuccess) {
      // Test authenticated pages
      await testRequestsPage(page);
      await testNewRequestPage(page);
      await testAdminPages(page);
      await testResponsiveness(page);
      await test404Errors(page);
    }

    // Test public pages (in new context to be logged out)
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await testRegisterPage(publicPage);
    await publicContext.close();

    // Check for console errors
    await testConsoleErrors(page);

  } catch (error) {
    console.error('\n❌ Test execution error:', error.message);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const highIssues = issues.filter(i => i.severity === 'high');
  const mediumIssues = issues.filter(i => i.severity === 'medium');
  const lowIssues = issues.filter(i => i.severity === 'low');

  console.log(`\nTotal Issues Found: ${issues.length}`);
  console.log(`  🔴 Critical: ${criticalIssues.length}`);
  console.log(`  🟠 High: ${highIssues.length}`);
  console.log(`  🟡 Medium: ${mediumIssues.length}`);
  console.log(`  🟢 Low: ${lowIssues.length}`);

  if (issues.length > 0) {
    console.log('\n📋 Issues Detail:');
    issues.forEach((issue, index) => {
      console.log(`\n${index + 1}. [${issue.severity.toUpperCase()}] ${issue.category}`);
      console.log(`   Page: ${issue.page}`);
      console.log(`   Description: ${issue.description}`);
    });
  }

  console.log('\n📸 Screenshots saved:');
  screenshots.forEach(s => console.log(`   ${s.path}`));

  return issues;
}

runTests().catch(console.error);
