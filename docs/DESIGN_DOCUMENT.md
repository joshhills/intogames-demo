# Firewall Defense - Live Operations Design Document

**Version:** 1.0  
**Date:** January 2025  
**Status:** Approved for Implementation  
**Document Owner:** Game Design & Live Operations Team

---

## Overview

This document outlines the functional requirements for the live operations infrastructure supporting **Firewall Defense**, a multiplayer cooperative defense game where players contribute to a shared global firewall through individual matches. This system must support real-time player engagement, dynamic content management, competitive leaderboards, and administrative control.

---

## 1. Player Profile System

### 1.1 Functional Requirements

**Goal:** Provide players with persistent identity and customization that carries across game sessions.

**Requirements:**

1. **Player Identification**
   - Each player must have a unique, persistent identifier (UUID)
   - Player identity must persist across browser sessions and device changes (stored server-side)
   - System must handle anonymous players who haven't completed profile setup

2. **Profile Customization**
   - Players can set a custom display name (tagline) for leaderboards and social features
   - Players can customize their in-game visual representation via color selection
   - Profile changes must be saved immediately and reflect in all live systems (leaderboard, notifications)
   - Default values must be assigned if player doesn't customize (auto-generated tagline, default color)

3. **Authentication & Security**
   - Players must obtain a secure token (JWT) upon first launch or login
   - Token must expire after a reasonable time period to prevent stale sessions
   - All profile updates must be authenticated to prevent impersonation

**Business Outcomes:**
- **Player Retention:** Personalized identity encourages players to return and maintain their progress
- **Social Engagement:** Display names enable recognition in leaderboards, fostering competition
- **Data Integrity:** Server-authoritative profiles prevent client-side manipulation

**Technical Constraints:**
- Profile data must be stored in a persistent database (not cache-only)
- Profile updates must be atomic (no partial updates visible to other players)
- System must handle high concurrency (multiple profile updates simultaneously)

---

## 2. Game Configuration System

### 2.1 Functional Requirements

**Goal:** Enable live operations team to adjust game difficulty, spawn rates, scoring mechanics, and match duration without code deployments.

**Requirements:**

1. **Difficulty Tiers**
   - System must support at least three difficulty levels: Easy, Medium, Hard
   - Each difficulty must have independent configuration for:
     - Number of vulnerability holes on the game canvas
     - Bug spawn rate (how frequently enemies appear)
     - Maximum bug movement speed
     - Penalty for bugs reaching holes (negative score)
     - Bonus for successfully defending (positive score)
     - Match duration (game time limit in seconds)

2. **Real-Time Configuration Updates**
   - Configuration changes must be applied immediately (no server restart required)
   - New game sessions must use the latest configuration when starting
   - Existing matches should continue with the configuration they started with (no mid-game changes)

3. **Configuration Validation**
   - System must validate all numeric values are positive and within reasonable bounds
   - System must prevent invalid configurations (e.g., negative spawn rates, zero game time)
   - Admin must receive clear error messages for invalid inputs

**Business Outcomes:**
- **Live Balancing:** Quickly adjust difficulty if players find modes too easy/hard
- **Event Management:** Temporarily adjust spawn rates or match duration for special events
- **A/B Testing:** Test different configurations on different player segments
- **Player Retention:** Maintain challenge curve to prevent boredom or frustration

**Technical Constraints:**
- Configuration must be server-authoritative (clients fetch on game start)
- Configuration must persist across server restarts (store in database or persistent cache)
- System must support fractional values for precise tuning (e.g., 1.5x speed multiplier)

---

## 3. Message of the Day (MOTD) System

### 3.1 Functional Requirements

**Goal:** Communicate important announcements, event information, and updates to all players in real-time.

**Requirements:**

1. **Message Persistence**
   - MOTD must persist across server restarts
   - MOTD must be visible to players on initial game load (not just after admin sends)
   - System must support clearing MOTD (setting to empty/null)

2. **Real-Time Broadcasting**
   - When admin updates MOTD, all currently connected players must see it immediately
   - Message must appear in both persistent UI (header) and notification toast
   - Message must not require page refresh to appear

3. **Message Display**
   - MOTD must be prominently displayed in the game client header
   - MOTD should also trigger a notification toast for immediate attention
   - System must handle long messages gracefully (text wrapping, truncation if needed)

**Business Outcomes:**
- **Player Communication:** Alert players to events, maintenance windows, or new features
- **Engagement:** Drive players to special events or promotions
- **Community Building:** Share community updates or celebrate milestones

**Technical Constraints:**
- MOTD must be stored server-side (not client-only)
- Broadcasting must use efficient push mechanism (WebSocket, not polling)
- System must handle players offline when MOTD is sent (they see it on next login)

---

## 4. Leaderboard System

### 4.1 Functional Requirements

**Goal:** Create competitive engagement through cumulative scoring and periodic resets that maintain long-term player interest.

**Requirements:**

1. **Cumulative Scoring**
   - Player scores must accumulate across multiple matches
   - If a player scores +260 in one match, then -100 in the next, their total score becomes +160
   - Leaderboard must reflect cumulative totals, not best single-match performance
   - Scores can be negative (player can have negative total score)

2. **Top Defenders Display**
   - System must show the top 3 players by cumulative score at all times
   - Display must include player tagline (display name) and score
   - Leaderboard must update in real-time when top 3 order changes

3. **Automatic Periodic Reset**
   - Leaderboard must automatically reset at configurable intervals (default: 60 minutes)
   - Reset must clear all leaderboard entries AND reset all player cumulative scores to 0
   - Reset timestamp must be tracked for "resets in X" countdown display
   - Reset interval must be configurable by admin (global setting, not per-difficulty)

4. **Manual Leaderboard Management**
   - Admin must be able to view full leaderboard (all entries, not just top 3)
   - Admin must be able to manually flush leaderboard (reset all scores)
   - Manual flush must trigger same behavior as automatic flush
   - Flush action must require confirmation to prevent accidental data loss

5. **Player Score Visibility**
   - Players must see their own cumulative score below the top 3 leaderboard
   - Player score must update immediately after match completion
   - System must show countdown timer indicating when leaderboard will next reset
   - Countdown must be accurate to the second and update in real-time

**Business Outcomes:**
- **Competitive Engagement:** Leaderboard creates ongoing motivation to play and improve
- **Retention:** Periodic resets prevent leaderboard stagnation and give new players a chance
- **Social Competition:** Top 3 visibility encourages players to compete for recognition
- **Fair Competition:** Resets ensure no player has permanent advantage from early access

**Technical Constraints:**
- Leaderboard must use efficient data structure for top-N queries (sorted set, not full scan)
- Score updates must be atomic (no race conditions when multiple matches complete simultaneously)
- System must handle players submitting scores during leaderboard flush (consistent state)
- Countdown timer must be calculated client-side from server-provided timestamp (not polling)

---

## 5. Global Firewall Health System

### 5.1 Functional Requirements

**Goal:** Create a shared, persistent metagame that connects individual player actions to a global outcome visible to all players.

**Requirements:**

1. **Server-Authoritative Health**
   - Global firewall health must be stored server-side (not client-calculated)
   - Health must persist across server restarts
   - Health must have a configurable maximum cap (e.g., 10,000)
   - Health cannot exceed maximum or go below 0

2. **Health Updates from Matches**
   - When a player completes a match, their score is added to global health
   - Positive scores increase health (up to max)
   - Negative scores decrease health (down to 0)
   - Health updates must be atomic (no partial updates visible)

3. **Real-Time Health Display**
   - All players must see the same current health value
   - Health must update in real-time when any player completes a match (no refresh needed)
   - Health must be prominently displayed in game client header

4. **Admin Health Management**
   - Admin must be able to view current health and maximum health
   - Admin must be able to adjust current health (for events, corrections, or testing)
   - Admin must be able to adjust maximum health (for scaling difficulty or events)
   - System must prevent invalid states (health > max or health < 0)
   - If max health is reduced below current health, current health must be capped

**Business Outcomes:**
- **Cooperative Gameplay:** Players feel they're contributing to a shared goal
- **Urgency:** Low health creates urgency and drives engagement
- **Community Events:** Admin can set health to specific values for events or narratives
- **Metagame Progression:** Health changes create narrative tension and goals

**Technical Constraints:**
- Health updates must be atomic (use transactions or atomic operations)
- System must handle high concurrency (many matches completing simultaneously)
- Health broadcast must use efficient push mechanism (not polling)
- Health must be stored in fast-access storage (Redis for real-time, optionally backed by database)

---

## 6. Live Notifications System

### 6.1 Functional Requirements

**Goal:** Deliver real-time updates to all connected players without requiring page refreshes or polling.

**Requirements:**

1. **WebSocket Connection**
   - Clients must establish persistent WebSocket connection to push service
   - Connection must auto-reconnect if dropped
   - Connection must support keep-alive (ping/pong) to detect failures
   - System must handle thousands of concurrent connections

2. **Notification Types**
   - **Health Updates:** Broadcast when global health changes
   - **Leaderboard Updates:** Broadcast when top 3 changes or leaderboard is flushed
   - **MOTD:** Broadcast when admin updates Message of the Day
   - **Match Completion:** (Optional) Notify when player's own match completes

3. **Message Delivery**
   - Messages must be delivered to all connected clients simultaneously
   - Messages must be delivered reliably (no silent failures)
   - System must handle clients that are temporarily disconnected (they miss live updates but see state on reconnect)

4. **Notification Display**
   - Notifications must appear in a non-intrusive toast/notification area
   - Notifications must auto-dismiss after a reasonable time (or be dismissible)
   - Critical notifications (MOTD) may require persistent display until acknowledged

**Business Outcomes:**
- **Real-Time Engagement:** Players see immediate feedback from their actions and others'
   - Immediate gratification when health updates or leaderboard changes
   - Creates sense of live, active community
- **Information Delivery:** Ensure players see important updates (events, maintenance)
- **Social Presence:** Knowing other players are active increases engagement

**Technical Constraints:**
- Push service must use efficient broadcast mechanism (Redis Pub/Sub, not individual sends)
- System must handle message queuing if push service is temporarily unavailable
- WebSocket connections must be lightweight (not one connection per message type)
- System must support horizontal scaling (multiple push service instances)

---

## 7. Administrative Control Panel

### 7.1 Functional Requirements

**Goal:** Provide live operations team with a web-based interface for managing all game systems without requiring code changes or database access.

**Requirements:**

1. **Authentication & Security**
   - Admin panel must require authentication (username/password)
   - Admin actions must be logged for audit purposes
   - Admin panel must not expose sensitive data (JWT secrets, database credentials) in client

2. **Game Configuration Management**
   - Admin must be able to view current configuration for all difficulty levels
   - Admin must be able to edit configuration values
   - Admin must see visual indication of unsaved changes
   - Admin must be warned if attempting to leave page with unsaved changes
   - Save button must be disabled if no changes have been made
   - Configuration must be organized by difficulty (tabs or sections) to reduce page length

3. **Global Health Management**
   - Admin must be able to view current health and maximum health
   - Admin must be able to edit both values independently
   - Admin must see validation errors for invalid inputs (negative health, max < 1)

4. **MOTD Management**
   - Admin must be able to view current MOTD
   - Admin must be able to update MOTD with a single action (update + broadcast)
   - Admin must see confirmation when MOTD is successfully sent

5. **Leaderboard Management**
   - Admin must be able to view full leaderboard (all entries with player UUIDs for identification)
   - Admin must be able to manually flush leaderboard with confirmation dialog
   - Admin must be able to view and edit leaderboard flush interval (in minutes)
   - Admin must see last flush time and next flush countdown

**Business Outcomes:**
- **Rapid Response:** Fix issues or adjust game balance without waiting for code deployment
- **Event Management:** Quickly set up special events or promotions
- **Data Visibility:** Monitor player engagement through leaderboard and health metrics
- **Operational Efficiency:** Single interface for all live ops tasks

**Technical Constraints:**
- Admin panel must proxy requests to API service (not direct database access)
- All admin actions must be validated server-side (not client-only)
- Admin panel must handle network failures gracefully (show errors, don't silently fail)
- Admin panel must work across different browsers and devices

---

## 8. Data Persistence & Reliability

### 8.1 Functional Requirements

**Goal:** Ensure player data and game state survive server restarts and are not lost due to crashes.

**Requirements:**

1. **Player Profile Persistence**
   - Player profiles (UUID, tagline, color, totalScore) must be stored in persistent database
   - Profile data must survive server restarts
   - Profile updates must be durable (written to disk, not just memory)

2. **Global State Persistence**
   - Global health, max health, MOTD, and leaderboard flush timestamp must persist
   - These values must be restored on server restart
   - Default values must be set if data doesn't exist (e.g., health = 100, maxHealth = 1000)

3. **Leaderboard Persistence**
   - Leaderboard entries (player UUIDs and scores) must persist across restarts
   - Leaderboard must be restored to exact state before restart

4. **Configuration Persistence**
   - Game configuration should persist (or be stored in database/config file)
   - Configuration should not reset to defaults on server restart

**Business Outcomes:**
- **Player Trust:** Players expect their progress to be saved
- **Data Integrity:** Prevent loss of player achievements or leaderboard positions
- **Reliability:** System must recover gracefully from failures

**Technical Constraints:**
- Use persistent database for player profiles and critical state
- Use Redis for fast-access real-time data, but optionally persist to database periodically
- System must handle database connection failures gracefully (degrade, don't crash)

---

## 9. Scalability Considerations

### 9.1 Functional Requirements

**Goal:** System must handle growth in player count and match completion rate without degradation.

**Requirements:**

1. **High Concurrency**
   - System must handle hundreds of simultaneous matches completing
   - Leaderboard updates must not bottleneck (use efficient data structures)
   - Health updates must not conflict (atomic operations)

2. **Horizontal Scaling**
   - Push service must support multiple instances (load balancing)
   - API service should support multiple instances (stateless design)
   - Shared state (Redis, database) must be accessible from all instances

3. **Performance**
   - API responses must be sub-200ms for most requests
   - WebSocket messages must be delivered within 100ms of trigger
   - Leaderboard queries must be fast (O(log N) not O(N))

**Technical Constraints:**
- Use Redis for shared state (leaderboard, health) to enable horizontal scaling
- API service should be stateless (no in-memory state that requires sticky sessions)
- Database queries must be indexed appropriately

---

## 10. Integration Points

### 10.1 Game Client Integration

The game client must:
- Fetch game configuration on startup before allowing game to begin
- Submit match completion with score and difficulty
- Display real-time updates (health, leaderboard, MOTD) via WebSocket
- Show player's own cumulative score and leaderboard reset countdown
- Handle authentication and profile management

### 10.2 Admin Panel Integration

The admin panel must:
- Authenticate admin users
- Proxy all requests to API service (not direct database access)
- Provide real-time feedback for all actions (success/error messages)
- Display current state of all systems (config, health, leaderboard, MOTD)

### 10.3 API Service Responsibilities

The API service must:
- Handle all player authentication and profile management
- Process match completions and update global state
- Manage game configuration
- Broadcast updates via Redis Pub/Sub for push service to deliver
- Provide admin endpoints for live operations

### 10.4 Push Service Responsibilities

The push service must:
- Maintain WebSocket connections to all connected clients
- Subscribe to Redis Pub/Sub channel for broadcast messages
- Deliver messages to all connected clients simultaneously
- Handle connection lifecycle (connect, disconnect, reconnect)

---

## Success Metrics

The following metrics indicate successful implementation:

1. **Player Engagement**
   - Players complete multiple matches in a session (cumulative scoring encourages repeat play)
   - Players check leaderboard regularly (top 3 visibility creates competition)

2. **Live Operations Efficiency**
   - Admin can update game config and see changes reflected in < 30 seconds
   - Admin can send MOTD and all online players see it within 5 seconds

3. **System Reliability**
   - Zero data loss (all player scores and profiles persist)
   - 99.9% uptime (system handles restarts gracefully)

4. **Real-Time Performance**
   - Health updates visible to all players within 1 second of match completion
   - Leaderboard changes visible to all players within 2 seconds

---

## Out of Scope (Future Considerations)

The following features are explicitly **not** required for initial implementation but may be considered for future versions:

- Player-to-player messaging or chat
- Guilds or team-based competition
- Achievement system or trophies
- Player reporting or moderation tools
- Analytics dashboard (beyond basic leaderboard viewing)
- A/B testing framework for configurations
- Event scheduling system (automated config changes at specific times)
- Multi-region support or geographic leaderboards
- Player history or match replay system

---

## Approval

**Design Approval:** Game Design Team  
**Technical Approval:** Engineering Team  
**Live Ops Approval:** Live Operations Team  

**Next Steps:** Implementation by Engineering Team

---

**Document History:**
- v1.0 (January 2025): Initial design document created for Firewall Defense live operations system

