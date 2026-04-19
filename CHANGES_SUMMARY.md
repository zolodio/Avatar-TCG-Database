# Avatar TCG Profile UI Restructuring - Changes Summary

## Overview
The Profile section has been completely restructured with a persistent header profile indicator and a new nested tab navigation system. The merge conflict dialog now only shows once per session.

---

## 1. PERSISTENT HEADER PROFILE INDICATOR

### Location
Upper right corner of the page header, consistently visible across **all tabs and nested tabs**.

### What's Shown
- **Avatar** (circular profile picture or initial letter in gradient)
- **Username** (display name from profile)
- **"Profile" label** (indicates it's clickable)

### Behavior
- **Hidden** when user is not logged in or hasn't set up a profile
- **Visible** once user is authenticated and has created a profile
- **Clickable** - clicking it navigates to the Profile tab
- Automatically updates when profile data changes
- Automatically hidden on logout

### Technical Implementation
```javascript
function updateHeaderProfile()  // Shows the indicator
function hideHeaderProfile()     // Hides the indicator
```

### CSS Notes
- Hidden on mobile (<480px) for space efficiency
- Uses CSS variables for consistent theming
- Responsive padding and sizing

---

## 2. RESTRUCTURED PROFILE TAB

### Previous Structure
```
Profile Tab
├── Auth Panel
├── Username Setup (popup)
├── Profile Header (floating with edit button)
│   ├── Avatar + "Edit Profile" button
│   └── Favorite chamber card display
└── Social Section
    ├── Friends
    ├── Chat
    ├── Trades
    └── Forum
```

### New Structure
```
Profile Tab
├── Auth Panel (unchanged)
├── Username Setup (still shown when needed)
└── Social Section (when logged in + profile exists)
    ├── Nested Tab Navigation
    │   ├── Edit Profile
    │   ├── Friends
    │   ├── Chat
    │   ├── Trades
    │   └── Forum
    └── Nested Tab Content Panes
        ├── social-edit-profile
        ├── social-friends
        ├── social-chat
        ├── social-trades
        └── social-forum
```

### Key Changes

#### **Removed**
- Floating profile header within the Profile tab
- Favorite chamber card display
- "Edit Profile" as a popup/modal
- Username/avatar display in Profile tab content

#### **Added**
- Nested tab navigation (`.tab-nav-nested`)
- "Edit Profile" as first nested tab
- Friends, Chat, Trades, Forum as sibling nested tabs
- Persistent header profile indicator (upper right)

---

## 3. NESTED TAB STRUCTURE

### HTML Structure
```html
<div class="tab-nav-nested">
  <button class="tab-btn-nested active" data-nested-tab="edit-profile">
    <i class="fas fa-edit"></i> Edit Profile
  </button>
  <button class="tab-btn-nested" data-nested-tab="friends">
    <i class="fas fa-user-friends"></i> Friends
  </button>
  <button class="tab-btn-nested" data-nested-tab="chat">
    <i class="fas fa-comments"></i> Chat
  </button>
  <button class="tab-btn-nested" data-nested-tab="trades">
    <i class="fas fa-handshake"></i> Trades
  </button>
  <button class="tab-btn-nested" data-nested-tab="forum">
    <i class="fas fa-comments-dollar"></i> Forum
  </button>
</div>

<!-- Content panes -->
<div id="social-edit-profile" class="social-pane"><!-- Content --></div>
<div id="social-friends" class="social-pane" style="display:none;"><!-- Content --></div>
<div id="social-chat" class="social-pane" style="display:none;"><!-- Content --></div>
<div id="social-trades" class="social-pane" style="display:none;"><!-- Content --></div>
<div id="social-forum" class="social-pane" style="display:none;"><!-- Content --></div>
```

### CSS Classes
```css
.tab-nav-nested       /* Container for nested tabs */
.tab-btn-nested       /* Individual nested tab button */
.tab-btn-nested.active /* Active state */
.social-pane          /* Content container */
```

### JavaScript Handler
The `initSocialTabs()` function now handles:
- **Clicking nested tabs** - shows corresponding pane
- **Loading content** - calls appropriate loaders (loadChat, loadFriends, etc.)
- **Edit Profile tab** - calls `initProfileEditor()` when clicked

```javascript
function initSocialTabs() {
  // Handles click events on all nested tabs
  // Shows/hides panes
  // Loads data when panes are opened
}
```

---

## 4. EDIT PROFILE TAB

### New Location
First nested tab under Profile → "Edit Profile"

### No Longer
- A popup/modal overlay
- Triggered by a button click
- Floating above other content

### Identifier
```html
id="social-edit-profile" 
data-nested-tab="edit-profile"
```

### Content Container
```html
<div id="profileEditorContainer"></div>
```
This is where the profile editor form is rendered by `initProfileEditor()`.

---

## 5. MERGE CONFLICT DIALOG - ONCE PER SESSION

### Previous Behavior
Could show multiple times if user synced repeatedly

### New Behavior
**Shows only once per browser session** (until page refresh/new session)

### Implementation

#### Session Flag
```javascript
var mergeDlgShownThisSession = false;
```

#### Show Function
```javascript
function showMergeConflict(localSummary, cloudSummary) {
  if (mergeDlgShownThisSession) return; // ← Only shows if not shown yet
  mergeDlgShownThisSession = true;
  // ... display dialog ...
}
```

#### Close Function
```javascript
function closeMergeConflict() {
  document.getElementById('auth-merge-dlg').style.display = 'none';
  // Note: Does NOT reset the session flag, so dialog won't show again
}
```

### When It Shows
- **First sync conflict** in a session → Shows dialog
- **Subsequent conflicts** in same session → Silently resolves or auto-syncs
- **New session** (page refresh) → Ready to show again if conflict occurs

### User Actions
- Click "Use Cloud Data" → Uses cloud collection
- Click "Keep Local & Upload It" → Keeps local, uploads to cloud
- Dialog closes either way
- Won't show again in this session

---

## 6. MODIFIED FILES

### HTML File
**File**: `index_modified.html`

**Changes Made**:
1. Added persistent header profile indicator
   ```html
   <div id="headerProfileIndicator" style="position: absolute; top: 14px; right: 16px; ..."
   ```

2. Restructured Profile tab with nested tabs
   - Removed old floating profile section
   - Added `.tab-nav-nested` with 5 tabs
   - Added 5 content panes (`.social-pane`)
   - Added `id="profileEditorContainer"` for edit form

3. Added merge conflict tracking
   - Added `mergeDlgShownThisSession` flag initialization
   - Added `showMergeConflict()` and `closeMergeConflict()` functions

### JavaScript File (social.js)
**File**: `social_updated.js`

**Functions Modified**:
1. **`initSocialTabs()`** 
   - Now handles `data-nested-tab="edit-profile"`
   - Calls `initProfileEditor()` when edit-profile tab clicked

2. **`updateHeaderProfile()`** (New)
   - Renders avatar + username in header
   - Makes it clickable to navigate to Profile tab

3. **`hideHeaderProfile()`** (New)
   - Hides the header indicator (called on logout)

4. **`activateSocialSection()`**
   - Now calls `updateHeaderProfile()` to show header indicator

5. **`window.socialOnLogout`**
   - Now calls `hideHeaderProfile()` on logout

---

## 7. CSS UPDATES

### New/Modified Styles

#### Header Profile Indicator
```css
#headerProfileIndicator {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 100;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: none; /* Hidden by default */
  transition: all 0.2s;
}

#headerProfileIndicator:hover {
  border-color: var(--border-light);
  background: var(--bg-card-hover);
  cursor: pointer;
}
```

#### Mobile Responsive
```css
@media (max-width: 480px) {
  #headerProfileIndicator { display: none; } /* Hidden on mobile */
}

@media (min-width: 768px) {
  #headerProfileIndicator { display: block; } /* Shown on desktop */
}
```

#### Nested Tab Navigation
```css
.tab-nav-nested {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.tab-btn-nested {
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn-nested:hover {
  color: var(--text-primary);
  border-bottom-color: var(--border-light);
}

.tab-btn-nested.active {
  color: var(--zen);
  border-bottom-color: var(--zen);
}
```

---

## 8. USAGE GUIDE FOR DEVELOPERS

### How Nested Tabs Work

1. **User clicks a nested tab**
   ```html
   <button class="tab-btn-nested" data-nested-tab="friends">...</button>
   ```

2. **Event handler in `initSocialTabs()`** detects click and:
   - Adds `.active` class to clicked button
   - Removes `.active` from other buttons
   - Shows corresponding `.social-pane`
   - Hides other panes
   - Calls appropriate loader function (e.g., `loadFriends()`)

3. **Content displays** in the pane

### How Header Profile Works

1. **On login**, `socialOnLogin()` is called from `auth.js`
2. **Calls** `setupProfileSection(user)`
3. **If profile exists**, calls `activateSocialSection(profile)`
4. **Which calls** `updateHeaderProfile()`
5. **Header indicator appears** and updates whenever profile changes

### How Merge Dialog Shows Once

1. **First sync conflict** occurs
2. **Code calls** `showMergeConflict(localSummary, cloudSummary)`
3. **Function checks** `if (mergeDlgShownThisSession) return;`
4. **If not shown yet**, sets flag to `true` and displays dialog
5. **User resolves** by clicking a button
6. **Dialog closes**, but flag stays `true`
7. **Next conflict** in same session - dialog doesn't show

---

## 9. TESTING CHECKLIST

### Header Profile Indicator
- [ ] Shows when user is logged in and has a profile
- [ ] Hides when user is logged out
- [ ] Shows username correctly
- [ ] Clickable and navigates to Profile tab
- [ ] Hidden on mobile view (<480px)
- [ ] Visible on desktop (≥768px)
- [ ] Updates when profile data changes

### Nested Tabs
- [ ] All 5 tabs are visible and clickable
- [ ] Only one tab shows active state at a time
- [ ] Clicking a tab shows the correct pane
- [ ] Edit Profile tab shows the profile editor form
- [ ] Friends tab loads and displays friends list
- [ ] Chat tab loads and displays chat interface
- [ ] Trades tab loads and displays trades
- [ ] Forum tab loads and displays posts

### Edit Profile
- [ ] Accessible from first nested tab
- [ ] Form renders correctly in `#profileEditorContainer`
- [ ] Can edit profile without any popup modal
- [ ] Changes save correctly

### Merge Dialog
- [ ] Shows on first conflict in a session
- [ ] Doesn't show on subsequent conflicts (same session)
- [ ] Shows again after page refresh
- [ ] User can choose which data wins
- [ ] Dialog closes after choice is made

---

## 10. NOTES FOR MIGRATION

### Files to Update
1. Replace your old `index.html` with `index_modified.html`
2. Replace your old `social.js` with `social_updated.js`
3. No changes needed in `auth.js`, `digital-collection.js`, or `supabase-config.js`

### Breaking Changes
- Old profile popup modal is gone
- Old floating profile header is gone
- Favorite chamber card display is removed
- Edit Profile is now a tab instead of a popup

### Backward Compatibility
- All existing functionality is preserved
- Chat, Friends, Trades, Forum work exactly as before
- Auth system unchanged
- Digital collection unchanged

---

## 11. FUTURE ENHANCEMENTS

Possible improvements:
- Add profile picture/avatar upload in Edit Profile tab
- Show notification badge on Friends tab when new friend requests arrive
- Add unread message count to Chat tab
- Add pending trades count to Trades tab
- Remember last active nested tab (localStorage)
- Animate transitions between nested tabs

---

## Questions or Issues?

If you encounter any problems with the new structure:
1. Check browser console for JavaScript errors
2. Verify all 5 nested tab buttons have correct `data-nested-tab` attributes
3. Ensure `#social-*` panes exist for each tab
4. Check that `id="profileEditorContainer"` exists in edit-profile pane
5. Verify `id="headerProfileIndicator"` exists in header
