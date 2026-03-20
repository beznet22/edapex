**Code Assist OAuth2 implementation** with full flow description:

---

## **Code Assist OAuth2 - Full Implementation**

**File:** `packages/core/src/code_assist/oauth2.ts`

### **OAuth Constants**

```typescript
// OAuth Client ID
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';

// OAuth Client Secret (safe to store in git - installed app)
const OAUTH_CLIENT_SECRET = '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';

// OAuth Scopes
const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// HTTP & Redirect Configuration
const HTTP_REDIRECT = 301;
const SIGN_IN_SUCCESS_URL = 'https://developers.google.com/gemini-code-assist/auth_success_gemini';
const SIGN_IN_FAILURE_URL = 'https://developers.google.com/gemini-code-assist/auth_failure_gemini';
```

---

## **Core Flow Description**

### **1. Main Entry Point: `getOauthClient()`**

```typescript
export async function getOauthClient(
  authType: AuthType,
  config: Config,
): Promise<AuthClient> {
  if (!oauthClientPromises.has(authType)) {
    oauthClientPromises.set(authType, initOauthClient(authType, config));
  }
  return oauthClientPromises.get(authType)!;
}
```

This function caches OAuth clients and ensures only one initialization per auth type.

---

### **2. Initialization: `initOauthClient()` - Lines 112-391**

The main initialization logic with multiple authentication paths:

#### **A. Check for Cached Credentials (Lines 116-199)**
```typescript
const credentials = await fetchCachedCredentials();

// BYOID (Bring Your Own Identity) support
if (credentials?.type === 'external_account_authorized_user') {
  const auth = new GoogleAuth({ scopes: OAUTH_SCOPE });
  const byoidClient = auth.fromJSON({...credentials});
  return byoidClient;
}

// Standard OAuth2Client
const client = new OAuth2Client({
  clientId: OAUTH_CLIENT_ID,
  clientSecret: OAUTH_CLIENT_SECRET,
  transporterOptions: { proxy: config.getProxy() },
});

// Register token update listener
client.on('tokens', async (tokens: Credentials) => {
  if (useEncryptedStorage) {
    await OAuthCredentialStorage.saveCredentials(tokens);
  } else {
    await cacheCredentials(tokens);
  }
  await triggerPostAuthCallbacks(tokens);
});
```

#### **B. Validate Cached Credentials (Lines 168-199)**
```typescript
if (credentials) {
  client.setCredentials(credentials as Credentials);
  try {
    const { token } = await client.getAccessToken();
    await client.getTokenInfo(token); // Validate with server
    
    if (!userAccountManager.getCachedGoogleAccount()) {
      await fetchAndCacheUserInfo(client);
    }
    debugLogger.log('Loaded cached credentials.');
    await triggerPostAuthCallbacks(credentials as Credentials);
    return client;
  } catch (error) {
    // Continue to authentication if cached credentials invalid
  }
}
```

#### **C. Compute Engine ADC Path (Lines 204-226)**
```typescript
if (authType === AuthType.COMPUTE_ADC) {
  try {
    const computeClient = new Compute({});
    await computeClient.getAccessToken();
    return computeClient;
  } catch (e) {
    throw new Error(`Could not authenticate using metadata server...`);
  }
}
```

#### **D. Two Authentication Modes (Lines 228-388)**

**Mode 1: Browser Launch Suppressed (Manual Code Input) - Lines 228-281**
```typescript
if (config.isBrowserLaunchSuppressed()) {
  if (!config.isInteractive()) {
    throw new FatalAuthenticationError('Manual authorization required...');
  }
  
  let success = false;
  const maxRetries = 2;
  
  enterAlternateScreen();
  writeToStdout('\u001B[2J\u001B[H'); // Clear screen
  
  try {
    for (let i = 0; !success && i < maxRetries; i++) {
      success = await authWithUserCode(client);
      if (!success) {
        writeToStderr('\nFailed to authenticate with user code...');
      }
    }
  } finally {
    exitAlternateScreen();
    coreEvents.emit(CoreEvent.ExternalEditorClosed);
  }
  
  if (!success) {
    throw new FatalAuthenticationError('Failed to authenticate with user code.');
  }
}
```

**Mode 2: Browser-Based Authentication - Lines 282-388**
```typescript
else {
  if (!config.getAcpMode()) {
    const userConsent = await getConsentForOauth('');
    if (!userConsent) {
      throw new FatalCancellationError('Authentication cancelled by user.');
    }
  }

  const webLogin = await authWithWeb(client);
  
  // Open browser
  const childProcess = await open(webLogin.authUrl);
  childProcess.on('error', (error) => {
    coreEvents.emit(CoreEvent.UserFeedback, {
      severity: 'error',
      message: `Failed to open browser: ${error}\nPlease try running with NO_BROWSER=true`,
    });
  });

  // Wait for authentication with timeout and cancellation handlers
  const authTimeout = 5 * 60 * 1000; // 5 minutes
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new FatalAuthenticationError('Authentication timed out after 5 minutes.'));
    }, authTimeout);
  });

  const cancellationPromise = new Promise<never>((_, reject) => {
    process.on('SIGINT', () =>
      reject(new FatalCancellationError('Authentication cancelled by user.'))
    );
  });

  await Promise.race([
    webLogin.loginCompletePromise,
    timeoutPromise,
    cancellationPromise,
  ]);
}
```

---

### **3. User Code Authentication: `authWithUserCode()` - Lines 403-485**

For manual (no-browser) authentication:

```typescript
async function authWithUserCode(client: OAuth2Client): Promise<boolean> {
  try {
    const redirectUri = 'https://codeassist.google.com/authcode';
    const codeVerifier = await client.generateCodeVerifierAsync();
    const state = crypto.randomBytes(32).toString('hex');
    
    // Generate authorization URL with PKCE
    const authUrl: string = client.generateAuthUrl({
      redirect_uri: redirectUri,
      access_type: 'offline',
      scope: OAUTH_SCOPE,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: codeVerifier.codeChallenge,
      state,
    });

    writeToStdout(
      'Please visit the following URL to authorize the application:\n\n' +
        authUrl +
        '\n\n',
    );

    // Wait for user to input authorization code
    const code = await new Promise<string>((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: createWorkingStdio().stdout,
        terminal: true,
      });

      const timeout = setTimeout(() => {
        rl.close();
        reject(new FatalAuthenticationError('Authorization timed out after 5 minutes.'));
      }, 300000); // 5 minute timeout

      rl.question('Enter the authorization code: ', (code) => {
        clearTimeout(timeout);
        rl.close();
        resolve(code.trim());
      });
    });

    if (!code) {
      writeToStderr('Authorization code is required.\n');
      return false;
    }

    // Exchange code for tokens using PKCE
    try {
      const { tokens } = await client.getToken({
        code,
        codeVerifier: codeVerifier.codeVerifier,
        redirect_uri: redirectUri,
      });
      client.setCredentials(tokens);
      return true;
    } catch (error) {
      writeToStderr('Failed to authenticate with authorization code:' + error + '\n');
      return false;
    }
  } catch (err) {
    if (err instanceof FatalCancellationError) throw err;
    writeToStderr('Failed to authenticate with user code:' + err + '\n');
    return false;
  }
}
```

---

### **4. Web-Based Authentication: `authWithWeb()` - Lines 487-610**

For browser-based authentication with local callback server:

```typescript
async function authWithWeb(client: OAuth2Client): Promise<OauthWebLogin> {
  const port = await getAvailablePort();
  const host = process.env['OAUTH_CALLBACK_HOST'] || '127.0.0.1';
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const state = crypto.randomBytes(32).toString('hex');
  
  // Generate authorization URL
  const authUrl = client.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    scope: OAUTH_SCOPE,
    state,
  });

  const loginCompletePromise = new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        // Validate callback URL path
        if (req.url!.indexOf('/oauth2callback') === -1) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(new FatalAuthenticationError('OAuth callback not received...'));
          return;
        }

        // Parse query parameters
        const qs = new url.URL(req.url!, 'http://127.0.0.1:3000').searchParams;

        // Check for OAuth errors
        if (qs.get('error')) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          const errorCode = qs.get('error');
          const errorDescription = qs.get('error_description') || 'No additional details';
          reject(new FatalAuthenticationError(`Google OAuth error: ${errorCode}. ${errorDescription}`));
        }
        // Validate CSRF protection
        else if (qs.get('state') !== state) {
          res.end('State mismatch. Possible CSRF attack');
          reject(new FatalAuthenticationError('OAuth state mismatch. Possible CSRF attack...'));
        }
        // Process authorization code
        else if (qs.get('code')) {
          try {
            const { tokens } = await client.getToken({
              code: qs.get('code')!,
              redirect_uri: redirectUri,
            });
            client.setCredentials(tokens);

            // Fetch and cache user info
            try {
              await fetchAndCacheUserInfo(client);
            } catch (error) {
              debugLogger.warn('Failed to retrieve Google Account ID:', error);
              // Don't fail auth if user info retrieval fails
            }

            res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_SUCCESS_URL });
            res.end();
            resolve();
          } catch (error) {
            res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
            res.end();
            reject(new FatalAuthenticationError(
              `Failed to exchange authorization code for tokens: ${error}`
            ));
          }
        } else {
          reject(new FatalAuthenticationError(
            'No authorization code received from Google OAuth.'
          ));
        }
      } catch (e) {
        if (e instanceof FatalAuthenticationError) {
          reject(e);
        } else {
          reject(new FatalAuthenticationError(
            `Unexpected error during OAuth authentication: ${e}`
          ));
        }
      } finally {
        server.close();
      }
    });

    server.listen(port, host, () => {
      // Server started successfully
    });

    server.on('error', (err) => {
      reject(new FatalAuthenticationError(`OAuth callback server error: ${err}`));
    });
  });

  return {
    authUrl,
    loginCompletePromise,
  };
}
```

---

### **5. Helper Functions**

#### **Get Available Port**
```typescript
export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = 0;
    try {
      const portStr = process.env['OAUTH_CALLBACK_PORT'];
      if (portStr) {
        port = parseInt(portStr, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          return reject(new Error(`Invalid OAUTH_CALLBACK_PORT: "${portStr}"`));
        }
        return resolve(port);
      }
      
      const server = net.createServer();
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
      });
      server.on('listening', () => {
        server.close();
        server.unref();
      });
      server.on('error', (e) => reject(e));
      server.on('close', () => resolve(port));
    } catch (e) {
      reject(e);
    }
  });
}
```

#### **Fetch Cached Credentials**
```typescript
async function fetchCachedCredentials(): Promise<Credentials | JWTInput | null> {
  const useEncryptedStorage = getUseEncryptedStorageFlag();
  if (useEncryptedStorage) {
    return OAuthCredentialStorage.loadCredentials();
  }

  const pathsToTry = [
    Storage.getOAuthCredsPath(),
    process.env['GOOGLE_APPLICATION_CREDENTIALS'],
  ].filter((p): p is string => !!p);

  for (const keyFile of pathsToTry) {
    try {
      const keyFileString = await fs.readFile(keyFile, 'utf-8');
      return JSON.parse(keyFileString);
    } catch (error) {
      debugLogger.debug(`Failed to load credentials from ${keyFile}:`, error);
    }
  }

  return null;
}
```

#### **Fetch and Cache User Info**
```typescript
async function fetchAndCacheUserInfo(client: OAuth2Client): Promise<void> {
  try {
    const { token } = await client.getAccessToken();
    if (!token) return;

    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      debugLogger.log('Failed to fetch user info:', response.status);
      return;
    }

    const userInfo = await response.json();
    await userAccountManager.cacheGoogleAccount(userInfo.email);
  } catch (error) {
    debugLogger.log('Error retrieving user info:', error);
  }
}
```

#### **Cache Credentials**
```typescript
async function cacheCredentials(credentials: Credentials) {
  const filePath = Storage.getOAuthCredsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const credString = JSON.stringify(credentials, null, 2);
  await fs.writeFile(filePath, credString, { mode: 0o600 });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Ignore
  }
}
```

---

## **Key Features Summary**

✅ **Two Authentication Modes:**
- Browser-based (redirects to Google OAuth)
- Manual code input (for `NO_BROWSER=true`)

✅ **PKCE Support:**
- Code verifier generation
- Code challenge with SHA256
- Secure exchange without client secret

✅ **Credential Caching:**
- File-based or encrypted storage
- Token refresh support
- User info caching

✅ **Security:**
- CSRF protection via state parameter
- Loopback IP restriction (127.0.0.1)
- Secure credential storage (0o600)
- SIGINT handling for cancellation

✅ **Timeout Protection:**
- 5-minute authentication timeout
- 5-minute user code input timeout
- Graceful cancellation handling