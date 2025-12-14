# BribeBank Testing Guide

This guide provides comprehensive testing procedures for all features in the BribeBank family rewards system. Tests are organized in logical order to ensure prerequisites are met.

---

## Prerequisites

- **Backend**: Running on port 3001 (or configured VITE_API_URL)
- **Frontend**: Running on port 5173 (or production URL)
- **Database**: PostgreSQL with all migrations applied

---

## Phase 1: Initial Setup & Authentication

### 1.1 First-Time Setup
**Goal**: Create the first family account

1. Navigate to the app URL
2. Click "Create Family Account"
3. Fill in:
   - Family Name: "Test Family"
   - Parent Name: "Test Parent"
   - Username: "testparent"
   - Password: "password123"
4. Click "Create Family"
5. **Verify**: You're logged in and see the Admin View dashboard

### 1.2 Login/Logout Flow
**Goal**: Test authentication persistence

1. Click account settings icon (top-right)
2. Click "Logout"
3. **Verify**: Redirected to login screen
4. Login with:
   - Username: "testparent"
   - Password: "password123"
5. **Verify**: Successfully logged in to Admin View

### 1.3 Invalid Login
**Goal**: Test error handling

1. Logout if logged in
2. Attempt login with:
   - Username: "wronguser"
   - Password: "wrongpass"
3. **Verify**: Error message displayed
4. Login with correct credentials

---

## Phase 2: User Management

### 2.1 Create Child Account
**Goal**: Add a child user

1. In Admin View, click "Manage Users"
2. Click "Add New User"
3. Fill in:
   - Name: "Child One"
   - Username: "child1"
   - Password: "child123"
   - Role: Child
   - Avatar Color: Select any color (e.g., blue)
4. Click "Save"
5. **Verify**: Child appears in user list with correct avatar color

### 2.2 Create Multiple Children
**Goal**: Test multi-user scenarios

1. Repeat 2.1 to create:
   - Child Two (username: child2)
   - Child Three (username: child3)
2. **Verify**: All 3 children appear in user list
3. **Verify**: Each has unique avatar colors

### 2.3 Edit Child Account
**Goal**: Test user modification

1. Click edit icon next to "Child One"
2. Change:
   - Name: "Updated Child One"
   - Avatar Color: Different color
3. Click "Save"
4. **Verify**: Changes are reflected in user list

### 2.4 Delete Child Account
**Goal**: Test user removal

1. Click delete icon next to "Child Three"
2. Confirm deletion
3. **Verify**: User removed from list
4. **Verify**: Only "Child One" and "Child Two" remain

### 2.5 Child Login
**Goal**: Verify child can access wallet view

1. Logout from parent account
2. Login as:
   - Username: "child1"
   - Password: "child123"
3. **Verify**: Redirected to Wallet View (child interface)
4. **Verify**: No admin features visible
5. Logout and login as parent again

---

## Phase 3: Reward System

### 3.1 Create Reward Template
**Goal**: Set up recurring rewards

1. In Admin View, scroll to "Reward Templates"
2. Click "Add New Reward"
3. Fill in:
   - Title: "Ice Cream Trip"
   - Description: "Trip to ice cream shop"
   - Emoji: 🍦
   - Type: Privilege
   - Theme Color: Blue gradient
4. Click "Save"
5. **Verify**: Template appears in list

### 3.2 Create Multiple Reward Templates
**Goal**: Build reward library

1. Create these additional templates:
   - "Movie Night" 🎬 (Privilege, Purple)
   - "$5 Cash" 💵 (Money, Green)
   - "Extra Screen Time" 📱 (Privilege, Blue)
2. **Verify**: All 4 templates listed

### 3.3 Assign Reward to Child
**Goal**: Grant a reward

1. Click "Assign" next to "Ice Cream Trip"
2. Select "Child One"
3. Click "Assign Reward"
4. **Verify**: Toast notification appears
5. **Verify**: "Ice Cream Trip" appears in "Assigned Prizes" section for Child One

### 3.4 Child Claims Reward
**Goal**: Test child reward claiming

1. Logout and login as "child1"
2. **Verify**: "Ice Cream Trip" appears in wallet with "CLAIM" button
3. Click "CLAIM"
4. **Verify**: Status changes to "Pending Approval"
5. **Verify**: Button changes to "Pending..."
6. Logout and login as parent

### 3.5 Parent Approves Reward
**Goal**: Complete reward lifecycle

1. In Admin View, find "Ice Cream Trip" for Child One
2. **Verify**: Status shows "Pending Approval"
3. Click "Approve" (✓ icon)
4. **Verify**: Reward removed from pending list
5. **Verify**: History shows approval event

### 3.6 Parent Rejects Reward
**Goal**: Test rejection flow

1. Assign "Movie Night" to "Child One"
2. Login as child1, claim the reward
3. Logout and login as parent
4. Find "Movie Night" for Child One
5. Click "Reject" (✗ icon)
6. **Verify**: Reward status changes back to "Available"
7. Login as child to verify it's claimable again

### 3.7 Edit Reward Template
**Goal**: Modify existing template

1. In Admin View, click edit icon next to "Extra Screen Time"
2. Change:
   - Title: "1 Hour Screen Time"
   - Emoji: ⏰
3. Click "Save"
4. **Verify**: Changes reflected in template list

### 3.8 Delete Reward Template
**Goal**: Remove unused template

1. Click delete icon next to "$5 Cash"
2. Confirm deletion
3. **Verify**: Template removed from list
4. **Verify**: No impact on assigned rewards

---

## Phase 4: Bounty System (Tasks)

### 4.1 Create Bounty Template
**Goal**: Set up recurring tasks

1. In Admin View, scroll to "Bounty Templates"
2. Click "Add New Bounty"
3. Fill in:
   - Title: "Clean Room"
   - Description: "Clean and organize bedroom"
   - Emoji: 🧹
   - Tickets: 5
   - Theme Color: Orange gradient
4. Click "Save"
5. **Verify**: Template appears in list

### 4.2 Create Multiple Bounty Templates
**Goal**: Build task library

1. Create these additional templates:
   - "Do Dishes" 🍽️ (3 tickets, Green)
   - "Homework Complete" 📚 (10 tickets, Purple)
   - "Walk Dog" 🐕 (4 tickets, Blue)
2. **Verify**: All 4 templates listed

### 4.3 Assign Bounty to Child
**Goal**: Assign a task

1. Click "Assign" next to "Clean Room"
2. Select "Child Two"
3. Click "Assign Bounty"
4. **Verify**: Toast notification appears
5. **Verify**: "Clean Room" appears in "Assigned Bounties" section for Child Two

### 4.4 Child Completes Bounty
**Goal**: Test task completion

1. Logout and login as "child2"
2. **Verify**: "Clean Room" appears in wallet as bounty
3. Click "COMPLETE" button
4. **Verify**: Status changes to "Pending Verification"
5. **Verify**: Button changes to "Pending..."
6. Logout and login as parent

### 4.5 Parent Verifies Bounty (Approve)
**Goal**: Award tickets for completed task

1. In Admin View, find "Clean Room" for Child Two
2. **Verify**: Status shows "Pending Verification"
3. Click "Verify" (✓ icon)
4. **Verify**: Bounty removed from pending list
5. **Verify**: Child Two's ticket balance increased by 5
6. **Verify**: History shows "EARNED_TICKETS" event

### 4.6 Parent Rejects Bounty
**Goal**: Test rejection flow

1. Assign "Do Dishes" to "Child Two"
2. Login as child2, mark as complete
3. Logout and login as parent
4. Find "Do Dishes" for Child Two
5. Click "Reject" (✗ icon)
6. **Verify**: Bounty status changes back to "Assigned"
7. Login as child to verify it's available to complete again

### 4.7 Edit Bounty Template
**Goal**: Modify task details

1. In Admin View, click edit icon next to "Walk Dog"
2. Change:
   - Tickets: 6 (increased from 4)
   - Emoji: 🦮
3. Click "Save"
4. **Verify**: Changes reflected in template list

### 4.8 Delete Bounty Template
**Goal**: Remove unused template

1. Click delete icon next to "Homework Complete"
2. Confirm deletion
3. **Verify**: Template removed from list

---

## Phase 5: Ticket System

### 5.1 Manual Ticket Grant
**Goal**: Test direct ticket awarding

1. In Admin View, find Child One in user list
2. Click "Give Tickets" button
3. Enter amount: 10
4. Click "Give"
5. **Verify**: Child One's balance increases by 10
6. **Verify**: History shows "RECEIVED_TICKETS" event

### 5.2 Verify Ticket Balance Persistence
**Goal**: Ensure tickets persist across sessions

1. Note Child One's current ticket balance
2. Logout and login as child1
3. **Verify**: Ticket balance matches expected value
4. Logout and login as parent

### 5.3 Ticket Refund on Rejection
**Goal**: Verify tickets aren't lost on rejection

1. Note Child Two's current ticket balance
2. Purchase a store item (see Phase 7) that costs tickets
3. Parent rejects the purchase
4. **Verify**: Tickets are refunded to Child Two

---

## Phase 6: Store System

### 6.1 Create Store Item
**Goal**: Add purchasable item

1. In Admin View, scroll to "Store Items"
2. Click "Add New Store Item"
3. Fill in:
   - Title: "Minecraft Skin"
   - Description: "Any Minecraft skin of your choice"
   - Cost: 25 tickets
   - Emoji: 🎮
4. Click "Save"
5. **Verify**: Item appears in store list

### 6.2 Create Multiple Store Items
**Goal**: Build store catalog

1. Create these additional items:
   - "Roblox Robux - 400" 🎮 (50 tickets)
   - "Pizza for Dinner" 🍕 (30 tickets)
   - "Sleepover Friend" 🎉 (40 tickets)
2. **Verify**: All 4 items listed with correct costs

### 6.3 Child Purchases Store Item
**Goal**: Test purchase flow

1. Ensure Child One has at least 25 tickets
2. Logout and login as child1
3. Navigate to store section (if separate) or find store items
4. Click "Buy" on "Minecraft Skin"
5. Confirm purchase
6. **Verify**: Ticket balance decreases by 25
7. **Verify**: Purchase appears in wallet as pending
8. Logout and login as parent

### 6.4 Parent Approves Purchase
**Goal**: Complete purchase lifecycle

1. In Admin View, find pending purchase for Child One
2. Click "Approve" (✓ icon)
3. **Verify**: Purchase marked as approved
4. **Verify**: Notification sent to child (check next login)
5. **Verify**: History shows purchase event

### 6.5 Parent Rejects Purchase
**Goal**: Test refund flow

1. Ensure Child Two has at least 30 tickets
2. Login as child2, purchase "Pizza for Dinner"
3. Logout and login as parent
4. Find pending purchase for Child Two
5. Click "Reject" (✗ icon)
6. **Verify**: Tickets refunded to Child Two (balance +30)
7. **Verify**: Purchase removed from pending list

### 6.6 Insufficient Tickets
**Goal**: Test purchase validation

1. Login as child with < 25 tickets
2. Attempt to purchase "Minecraft Skin"
3. **Verify**: Error message about insufficient tickets
4. **Verify**: Purchase not created

### 6.7 Edit Store Item
**Goal**: Update item details

1. In Admin View, click edit icon next to "Roblox Robux - 400"
2. Change:
   - Cost: 45 tickets (reduced from 50)
   - Description: "400 Robux gift card"
3. Click "Save"
4. **Verify**: Changes reflected in store list

### 6.8 Delete Store Item
**Goal**: Remove item from catalog

1. Click delete icon next to "Sleepover Friend"
2. Confirm deletion
3. **Verify**: Item removed from store list

---

## Phase 7: Prize Wheel

### 7.1 Access Wheel Management
**Goal**: Open wheel configuration

1. In Admin View, click "Manage Prize Wheel" button
2. **Verify**: Modal opens with wheel configuration options

### 7.2 Configure Spin Cost
**Goal**: Set ticket cost per spin

1. In wheel modal, find "Spin Cost (Tickets)" field
2. Set value to: 3
3. **Verify**: Input accepts value

### 7.3 Configure Winning Chance (Preset)
**Goal**: Use easy mode settings

1. Find "Winning Chance" section
2. Click "Easy" button (🎉 75%)
3. **Verify**: Button highlights with green border
4. **Verify**: Dynamic count shows correct Try Again segments

### 7.4 Add Prize Segments
**Goal**: Populate wheel with prizes

1. Click "Add Prize" button
2. Enter: "30 Min Screen Time"
3. Repeat to add:
   - "Candy Bar"
   - "Choose Dinner"
   - "Movie Night"
   - "Stay Up Late"
4. **Verify**: 5 prize segments listed
5. **Verify**: Dynamic count updates (e.g., "2 Try Again segments will be added (7 total segments)" for 75% chance)

### 7.5 Test Maximum Prize Limit
**Goal**: Verify 12-prize cap

1. Continue adding prizes until reaching 12
2. Attempt to add 13th prize
3. **Verify**: "Add Prize" button disabled
4. **Verify**: Button shows "Maximum 12 prizes"

### 7.6 Test Advanced Winning Chance
**Goal**: Fine-tune probability

1. Click "Advanced (Fine-tune percentage)"
2. Move slider to 50%
3. **Verify**: Slider and number input sync
4. **Verify**: Dynamic count shows equal prize/Try Again split
5. Try setting to 10% (very hard)
6. **Verify**: Warning appears for high segment count
7. Try setting to 1% with 12 prizes
8. **Verify**: Red error shows "> 50 total segments"

### 7.7 Test Segment Distribution
**Goal**: Verify even spacing

1. Configure: 8 prizes, 50% winning chance
2. **Verify**: Dynamic count shows "8 Try Again segments (16 total)"
3. Click "Save Changes"
4. Logout and login as child with at least 3 tickets
5. Open Prize Wheel
6. **Verify**: Wheel shows alternating pattern (Prize → 1 TA → Prize → 1 TA)
7. **Verify**: Gray segments have no labels (only prizes labeled)

### 7.8 Test Maximum Segment Limit
**Goal**: Prevent overcrowding

1. Login as parent, open wheel modal
2. Set: 12 prizes, 10% winning chance
3. **Verify**: Red warning shows segment count > 50
4. Attempt to save
5. **Verify**: Toast error appears
6. **Verify**: Changes not saved
7. Adjust to: 5 prizes, 50% winning chance
8. Save successfully

### 7.9 Child Spins Wheel (Win Prize)
**Goal**: Test winning spin

1. Login as child1 with at least 3 tickets
2. Note starting ticket balance
3. Click "Spin the Wheel" button
4. Click "Spin" in modal
5. **Verify**: Wheel animates for ~4 seconds
6. **Verify**: Wheel lands on prize segment
7. **Verify**: Result shows green box: "You won: [Prize Name]!"
8. **Verify**: Tickets decreased by 3
9. **Verify**: Prize appears in wallet
10. **Verify**: Notification received
11. Login as parent
12. **Verify**: History shows WHEEL_SPIN_WON event

### 7.10 Child Spins Wheel (Land on Try Again)
**Goal**: Test losing spin

1. Login as child1 with at least 3 tickets
2. Spin wheel until landing on gray Try Again segment
   - (May need multiple attempts if winning chance is high)
3. **Verify**: Result shows yellow box: "Try Again"
4. **Verify**: Message: "Better luck next time!"
5. **Verify**: Tickets decreased by 3
6. **Verify**: NO prize added to wallet
7. **Verify**: NO notification
8. Login as parent
9. **Verify**: NO history entry for this spin

### 7.11 Insufficient Tickets for Spin
**Goal**: Test validation

1. Login as child with < 3 tickets (or current spin cost)
2. Attempt to open wheel
3. **Verify**: Error message about insufficient tickets
4. **Verify**: Spin button disabled

### 7.12 Remove Prize Segment
**Goal**: Edit wheel configuration

1. Login as parent, open wheel modal
2. Click delete icon (🗑️) next to any prize
3. **Verify**: Prize removed from list
4. **Verify**: Dynamic count updates
5. Click "Save Changes"
6. **Verify**: Wheel updates successfully

### 7.13 Reset Wheel to Defaults
**Goal**: Test reset functionality

1. In wheel modal, click "Reset to Defaults"
2. Confirm reset
3. **Verify**: Wheel resets to default prize set
4. **Verify**: Spin cost and winning chance reset
5. Click "Save Changes"

### 7.14 Test Wheel Persistence
**Goal**: Verify configuration survives reload

1. Configure unique wheel setup (e.g., 6 prizes, 25% chance, 5 ticket cost)
2. Save changes
3. Refresh browser page
4. Login as parent, open wheel modal
5. **Verify**: Configuration matches what was saved
6. Login as child, open wheel
7. **Verify**: Wheel displays correct segments and spin cost

---

## Phase 8: History & Notifications

### 8.1 View History Timeline
**Goal**: Review family activity

1. In Admin View, scroll to "Recent History"
2. **Verify**: Events listed in reverse chronological order
3. **Verify**: Events show:
   - User name and avatar color
   - Emoji icon
   - Action description
   - Timestamp
4. **Verify**: Events include:
   - REWARD_ASSIGNED
   - REWARD_APPROVED
   - TASK_VERIFIED
   - EARNED_TICKETS
   - RECEIVED_TICKETS
   - WHEEL_SPIN_WON

### 8.2 Filter History by Action Type
**Goal**: Find specific events

1. Look for reward approval events (✓ icon)
2. Look for ticket earning events (🎟️ icon)
3. Look for wheel spin wins (🎡 icon)
4. **Verify**: Each event type distinguishable by emoji/icon

### 8.3 Child Notifications
**Goal**: Test notification system

1. Login as child1
2. Check notification bell icon
3. **Verify**: Unread count badge visible
4. Click notification icon
5. **Verify**: Dropdown shows recent notifications:
   - Reward assignments
   - Reward approvals
   - Bounty assignments
   - Wheel wins
6. Click "Mark all as read"
7. **Verify**: Badge disappears

### 8.4 Real-Time Updates (SSE)
**Goal**: Test server-sent events

1. Open browser in two windows/tabs
2. Window 1: Login as parent
3. Window 2: Login as child1
4. In Window 1: Assign reward to child1
5. **Verify**: Window 2 updates automatically (no refresh needed)
6. In Window 2: Claim the reward
7. **Verify**: Window 1 shows pending status automatically

---

## Phase 9: Account Settings

### 9.1 Update Parent Account
**Goal**: Modify parent details

1. In Admin View, click account settings icon
2. Change:
   - Name: "Updated Parent Name"
   - Username: "newparent"
3. Keep password same or change it
4. Click "Save"
5. **Verify**: Success message
6. Logout and login with new username
7. **Verify**: Can login successfully

### 9.2 Update Child Account
**Goal**: Modify child details

1. Login as child1
2. Click account settings icon
3. Change:
   - Name: "New Child Name"
   - Username: "newchild1"
   - Password: "newpass123"
4. Click "Save"
5. **Verify**: Success message
6. Logout and login with new credentials
7. **Verify**: Can login successfully
8. **Verify**: Name updated in wallet view

### 9.3 Password Change Validation
**Goal**: Test password requirements

1. In account settings, attempt password change
2. Try weak password: "123"
3. **Verify**: Validation error (if implemented)
4. Use strong password
5. **Verify**: Accepts valid password

---

## Phase 10: Edge Cases & Error Handling

### 10.1 Network Interruption Recovery
**Goal**: Test offline handling

1. Login as child
2. Disconnect network/Wi-Fi
3. Attempt to claim reward
4. **Verify**: Error message displayed
5. Reconnect network
6. Retry action
7. **Verify**: Action completes successfully

### 10.2 Concurrent Operations
**Goal**: Test race conditions

1. Open two parent sessions (different browsers)
2. Session 1: Start editing reward template
3. Session 2: Delete same reward template
4. Session 1: Try to save changes
5. **Verify**: Appropriate error handling

### 10.3 Deleted User Data Cleanup
**Goal**: Verify cascade deletions

1. Create new child account "Test Child"
2. Assign rewards and bounties to "Test Child"
3. Delete "Test Child" account
4. **Verify**: All associated assignments removed
5. **Verify**: History entries preserved
6. **Verify**: No broken references

### 10.4 Browser Back Button
**Goal**: Test navigation handling

1. Login as child
2. Navigate through: Wallet → Settings → Back (browser button)
3. **Verify**: Navigates correctly without errors
4. Logout → Back button
5. **Verify**: Cannot access protected routes

### 10.5 Long Text Handling
**Goal**: Test UI with edge cases

1. Create reward with very long title (200+ characters)
2. **Verify**: Text truncates gracefully with ellipsis
3. Create bounty with very long description
4. **Verify**: Description displays properly in all views

### 10.6 Zero/Negative Values
**Goal**: Test input validation

1. Try setting wheel spin cost to 0
2. **Verify**: Accepts 0 (free spins)
3. Try setting spin cost to -5
4. **Verify**: Rejects negative values
5. Try giving child -10 tickets
6. **Verify**: Validates positive values only

### 10.7 Empty States
**Goal**: Verify empty state messages

1. Create fresh family account
2. **Verify**: Empty states show for:
   - No reward templates
   - No bounty templates
   - No assigned rewards
   - No assigned bounties
   - No history events
3. **Verify**: Each has helpful message/icon

---

## Phase 11: Mobile Responsiveness

### 11.1 Mobile Admin View
**Goal**: Test parent interface on mobile

1. Open app on mobile device or use browser dev tools (360x640)
2. Login as parent
3. **Verify**: All admin features accessible
4. **Verify**: Modals fit screen
5. **Verify**: Tables/lists scroll horizontally if needed
6. **Verify**: Touch targets large enough

### 11.2 Mobile Wallet View
**Goal**: Test child interface on mobile

1. Login as child on mobile
2. **Verify**: Wallet cards stack vertically
3. **Verify**: Prize wheel fits and spins smoothly
4. **Verify**: Buttons easily tappable
5. **Verify**: Text readable without zooming

### 11.3 Tablet View (768px)
**Goal**: Test intermediate screen size

1. Resize browser to tablet width
2. Test both parent and child views
3. **Verify**: Layouts adapt appropriately
4. **Verify**: No horizontal scrolling on main content

---

## Phase 12: Performance & Load Testing

### 12.1 Large Data Sets
**Goal**: Test with realistic data volume

1. Create 50+ reward templates
2. Create 50+ bounty templates
3. Assign 20+ items to single child
4. **Verify**: UI remains responsive
5. **Verify**: Scrolling smooth
6. **Verify**: Search/filter works

### 12.2 Multiple Concurrent Users
**Goal**: Test multi-family scenarios

1. Create 5 child accounts
2. Have all 5 "logged in" (different browsers/devices)
3. Parent assigns tasks to all simultaneously
4. **Verify**: All children receive updates
5. **Verify**: No data conflicts

### 12.3 Long Session
**Goal**: Test session persistence

1. Login and leave session open for 24+ hours
2. Return and perform actions
3. **Verify**: JWT token refreshes or prompts re-login
4. **Verify**: No data loss

---

## Phase 13: Security Testing

### 13.1 Authorization Checks
**Goal**: Verify role-based access

1. Login as child
2. Attempt to access admin endpoints directly (via browser console):
   ```javascript
   fetch('http://localhost:3001/api/families/[id]/rewards', {
     method: 'POST',
     headers: { 'Authorization': 'Bearer ' + localStorage.getItem('bribebank_token') }
   })
   ```
3. **Verify**: Returns 403 Forbidden

### 13.2 Cross-Family Access Prevention
**Goal**: Ensure family isolation

1. Create second family account "Family 2"
2. Note family ID from browser console
3. Attempt to access Family 1's data using Family 2 credentials
4. **Verify**: Access denied

### 13.3 SQL Injection Prevention
**Goal**: Test input sanitization

1. In reward title, enter: `'; DROP TABLE users; --`
2. Save and verify
3. **Verify**: Text stored as literal string
4. **Verify**: No database errors

### 13.4 XSS Prevention
**Goal**: Test script injection

1. Create reward with title: `<script>alert('XSS')</script>`
2. View in child wallet
3. **Verify**: Script tag displayed as text, not executed
4. **Verify**: No JavaScript alert appears

---

## Phase 14: Progressive Web App (PWA)

### 14.1 Install as App
**Goal**: Test PWA installation

1. On mobile or Chrome desktop, look for "Install" prompt
2. Click "Install BribeBank"
3. **Verify**: App installs to home screen/desktop
4. Open installed app
5. **Verify**: Runs in standalone window

### 14.2 Offline Capability
**Goal**: Test service worker caching

1. Use installed PWA
2. Turn off Wi-Fi/data
3. **Verify**: App shell loads
4. **Verify**: Error messages for data operations
5. Reconnect
6. **Verify**: Operations resume

### 14.3 Push Notifications (if implemented)
**Goal**: Test native notifications

1. Grant notification permission
2. Parent assigns reward
3. **Verify**: Push notification appears on child's device
4. Click notification
5. **Verify**: Opens app to relevant section

---

## Regression Testing Checklist

After any code changes, verify these critical paths:

- [ ] Parent can create and assign rewards
- [ ] Child can claim rewards
- [ ] Parent can approve/reject claimed rewards
- [ ] Parent can create and assign bounties
- [ ] Child can complete bounties
- [ ] Parent can verify bounties (tickets awarded correctly)
- [ ] Parent can manually give tickets
- [ ] Child can purchase store items
- [ ] Parent can approve/reject purchases (refunds work)
- [ ] Prize wheel loads with correct segments
- [ ] Prize wheel spins and awards prizes correctly
- [ ] Try Again segments don't create notifications/history
- [ ] Real-time updates work (SSE)
- [ ] Login/logout functions properly
- [ ] Mobile layout responsive

---

## Known Issues / Limitations

Document any discovered issues here:

1. **Issue**: [Description]
   - **Steps to Reproduce**: [...]
   - **Expected**: [...]
   - **Actual**: [...]
   - **Severity**: High/Medium/Low

---

## Test Environment Setup Notes

### Database Reset (for fresh testing)
```bash
# SSH into server
cd ~/docker/bribebank/bribebank-api
npx prisma migrate reset --force
npx prisma migrate deploy
```

### Quick Test Data Script
Create a script to populate test data:
```javascript
// test-data-seed.js
// TODO: Script to create sample family, users, templates, and assignments
```

---

## Glossary

- **Reward**: Prize that parent assigns to child (requires claim + approval)
- **Bounty**: Task that child completes for tickets (requires verification)
- **Template**: Reusable definition for rewards or bounties
- **Assignment**: Instance of reward/bounty assigned to specific child
- **Tickets**: Currency earned from bounties, spent on store items and wheel spins
- **Try Again**: Losing segment on prize wheel (gray, no text)
- **SSE**: Server-Sent Events for real-time updates
- **PWA**: Progressive Web App

---

## Contact & Support

For issues discovered during testing:
- GitHub Issues: [Repository URL]
- Email: [Support email]
- Documentation: `/README.md`, `/.github/copilot-instructions.md`
