# Test Suite Documentation

This test suite implements comprehensive TDD (Test-Driven Development) coverage for the Simple Group Chat application, following the specifications in `doc/spec/simple-group-chat-spec-v2.md`.

## Test Structure

```
src/__tests__/
├── contract/           # Contract tests for WebSocket message validation
├── unit/              # Unit tests for core business logic
├── integration/       # Integration tests for component interactions
├── acceptance/        # Acceptance criteria tests from spec section 10
├── a11y/              # Accessibility tests with axe-core
├── load/              # Load and performance tests
└── README.md          # This documentation
```

## Test Categories

### 1. Contract Tests (`contract/`)

**File**: `websocket-messages.test.ts`
- **Purpose**: Validate WebSocket message types and schemas using Zod
- **Coverage**:
  - Client → Server message validation
  - Server → Client message validation
  - Message format consistency
  - Error response formats

### 2. Unit Tests (`unit/`)

#### `mentions.test.ts`
- **Purpose**: Test mention extraction and resolution logic
- **Coverage**:
  - `@username` token extraction
  - Case-insensitive matching
  - Display name → User ID resolution
  - Mention highlighting for display
  - Edge cases and security

#### `rate-limiting.test.ts`
- **Purpose**: Test token bucket rate limiting algorithm
- **Coverage**:
  - Token bucket initialization and consumption
  - Token refill at 3 per second
  - Burst limit of 10 messages
  - Rate limiting recovery

#### `auth-guards.test.ts`
- **Purpose**: Test authentication and authorization logic
- **Coverage**:
  - JWT token validation
  - Origin header validation
  - WebSocket authentication flow
  - Session management

### 3. Integration Tests (`integration/`)

#### `websocket-flow.test.ts`
- **Purpose**: Test complete WebSocket connection lifecycle
- **Coverage**:
  - Connection establishment with auth
  - Room join and history retrieval
  - Message sending and broadcasting
  - Display name changes
  - Connection cleanup
  - Error handling

#### `realtime-messaging.test.ts`
- **Purpose**: Test real-time message delivery between users
- **Coverage**:
  - Multi-user message broadcasting
  - Message delivery timing (< 300ms)
  - Rapid message succession handling
  - Presence updates
  - Message ordering and consistency

#### `differential-sync.test.ts`
- **Purpose**: Test `sinceTs` differential synchronization
- **Coverage**:
  - Initial history retrieval
  - Differential sync with `sinceTs`
  - Reconnection scenarios
  - Message deduplication
  - Edge cases and error handling

### 4. Acceptance Tests (`acceptance/`)

**File**: `acceptance-criteria.test.ts`
- **Purpose**: Validate all 10 acceptance criteria from spec section 10
- **Coverage**:
  1. Google signin → chat screen transition
  2. 5-user message delivery within 300ms
  3. Mention functionality with online user suggestions
  4. Recent 100 messages on page reload
  5. 2000+ character message rejection
  6. Rate limiting after 4+ messages/second
  7. Unauthenticated WebSocket rejection (401)
  8. Reconnection sync without duplicates
  9. Screen reader support (aria-live="polite")
  10. Test coverage > 80% for main logic

### 5. Accessibility Tests (`a11y/`)

**File**: `accessibility.test.tsx`
- **Purpose**: Ensure WCAG compliance and screen reader support
- **Coverage**:
  - Chat page accessibility
  - Login page accessibility
  - User settings modal accessibility
  - ARIA live regions for real-time updates
  - Form controls and labels
  - Color contrast requirements
  - Keyboard navigation
  - Focus management

### 6. Load Tests (`load/`)

**File**: `concurrent-users.test.ts`
- **Purpose**: Validate performance under load per spec requirements
- **Coverage**:
  - 5 concurrent user connections
  - 10 messages/second throughput for 60 seconds
  - Message ordering consistency
  - Connection stability under sustained load
  - Resource usage monitoring
  - Zero message loss requirement

## Test Execution

### Prerequisites
```bash
# Install dependencies
npm install

# Install additional test dependencies
npm install --save-dev jest-axe @testing-library/react @testing-library/jest-dom axe-core
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test categories
npm test -- --testPathPattern=contract
npm test -- --testPathPattern=unit
npm test -- --testPathPattern=integration
npm test -- --testPathPattern=acceptance
npm test -- --testPathPattern=a11y
npm test -- --testPathPattern=load

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- Uses Next.js Jest configuration
- JSDOM test environment for React components
- Excludes `/node_modules/` and `/.next/`
- Coverage collection from `src/**/*.{js,jsx,ts,tsx}`

### Test Setup (`jest.setup.js`)
- Extends Jest with `@testing-library/jest-dom`
- Mocks WebSocket for consistent testing
- Sets up global test utilities

## Mock Strategy

### Database Mocking
- `MessageRepository` is mocked for consistent test data
- Supports message creation, retrieval, and sync operations
- Enables testing without database dependencies

### Authentication Mocking
- `next-auth/jwt` mocked for authentication tests
- Configurable user tokens for different test scenarios
- Origin validation testing support

### WebSocket Mocking
- Real WebSocket connections for integration tests
- Mock WebSocket class for unit tests
- Configurable connection behavior

## Coverage Goals

Based on spec requirement "主要ロジック>80%":

### High Priority (>90% coverage)
- WebSocket message handling
- Authentication and authorization
- Rate limiting algorithms
- Mention extraction logic

### Medium Priority (>80% coverage)
- Database operations
- Real-time messaging
- Differential sync
- Error handling

### Lower Priority (>70% coverage)
- UI components
- Configuration
- Utilities

## Continuous Integration

### Test Pipeline
1. **Lint**: ESLint validation
2. **Type Check**: TypeScript compilation
3. **Unit Tests**: Fast feedback on core logic
4. **Integration Tests**: Component interaction validation
5. **Contract Tests**: API specification compliance
6. **Accessibility Tests**: WCAG violation detection
7. **Load Tests**: Performance validation
8. **Coverage Report**: Ensure >80% for main logic

### Performance Benchmarks
- WebSocket connection time: < 1 second
- Message delivery latency: < 300ms
- 5 concurrent users: Zero message loss
- Memory growth: < 50MB during load tests

## Test Data and Fixtures

### Mock Users
```typescript
const mockUsers = [
  { id: 'user_001', displayName: 'Alice' },
  { id: 'user_002', displayName: 'Bob' },
  { id: 'user_003', displayName: 'Charlie' }
];
```

### Mock Messages
```typescript
const mockMessage = {
  id: '01J8R6X7ABC123',
  roomId: 'default',
  userId: 'user_001',
  displayName: 'Alice',
  text: 'Hello @Bob!',
  mentions: ['user_002'],
  ts: Date.now()
};
```

## Debugging Tests

### Common Issues
1. **WebSocket timeout**: Increase timeout for connection tests
2. **Race conditions**: Use proper async/await patterns
3. **Mock conflicts**: Clear mocks between tests
4. **Memory leaks**: Ensure WebSocket connections are closed

### Debug Tools
```bash
# Verbose test output
npm test -- --verbose

# Run single test file
npm test -- websocket-flow.test.ts

# Debug mode
npm test -- --runInBand --detectOpenHandles
```

## Future Test Enhancements

### Planned Additions
- E2E tests with Playwright
- Visual regression tests
- API compatibility tests
- Security penetration tests
- Browser compatibility tests

### Performance Monitoring
- Real-time latency tracking
- Memory usage profiling
- Connection pool monitoring
- Database query optimization

## Contributing to Tests

### Adding New Tests
1. Follow existing file naming conventions
2. Include comprehensive test descriptions
3. Add appropriate mocks and fixtures
4. Update this documentation

### Test Quality Guidelines
- Each test should have a single responsibility
- Use descriptive test names explaining the scenario
- Include both positive and negative test cases
- Add edge case coverage for production readiness