# Custom Keycloak Login Theme - Security Fix

This custom Keycloak theme addresses a security vulnerability in the default login behavior.

## Security Issue

The default Keycloak login form reveals whether a username exists in the system by selectively highlighting form fields:
- If the username doesn't exist: only the username field is highlighted
- If the username exists but password is wrong: only the password field is highlighted

This behavior allows attackers to enumerate valid usernames through a "user enumeration" attack.

## Solution

This custom theme modifies the login form to always highlight **both** the username and password fields when any login error occurs, preventing information leakage about which usernames exist in the system.

### Implementation Details

1. **login.ftl**: Modified the Freemarker template to use a combined error check:
   ```freemarker
   <#assign showError = messagesPerField.existsError('username') || messagesPerField.existsError('password')>
   ```
   This ensures both fields receive the error styling when ANY error occurs.

2. **resources/css/login.css**: Added CSS rules to enforce consistent error highlighting across both fields.

3. **theme.properties**: Inherits from `keycloak.v2` to maintain the existing look and feel while only overriding the login behavior.

## Usage

The theme is automatically applied through:
- Docker build process copies the theme to `/opt/keycloak/themes`
- Realm configuration sets `"loginTheme": "mp"`

## Security Best Practices

This fix follows OWASP guidelines for preventing username enumeration:
- Generic error messages
- Consistent timing for all login attempts (handled by Keycloak)
- Consistent UI feedback regardless of error type
