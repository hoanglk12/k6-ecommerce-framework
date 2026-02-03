# Deployment Guide

This guide covers deploying and running k6 load tests in different environments.

## 📋 Deployment Options

| Option | Best For | Max VUs | Cost | Features |
|--------|----------|---------|------|----------|
| **GitHub Actions** | CI/CD, smoke tests | ~50 | Free (within limits) | Automated, integrated |
| **Grafana Cloud** | Load/stress tests | 10,000+ | Pay-per-use | Distributed, analytics |
| **Local** | Development, debugging | ~100 | Free | Full control, immediate |
| **Self-hosted** | Enterprise, on-prem | Unlimited | Infrastructure | Complete control |

## 🚀 GitHub Actions Deployment

### Setup

1. **Add Repository Secrets**

Navigate to: `Settings → Secrets and variables → Actions`

| Secret | Description | Required |
|--------|-------------|----------|
| `K6_CLOUD_TOKEN` | Grafana Cloud API token | For cloud tests |
| `K6_CLOUD_PROJECT_ID` | Grafana Cloud project ID | For cloud tests |

2. **Workflow Configuration**

The workflow (`.github/workflows/k6-tests.yml`) is pre-configured with:

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:      # Manual trigger
```

### Running Tests

#### Automatic (PR/Push)
Tests run automatically on pull requests with smoke test configuration:
- 10 VUs per site
- 2 minute duration
- All configured sites (Platypus AU/NZ, Skechers AU/NZ, Dr Martens AU/NZ, Vans AU/NZ)

#### Manual Trigger
1. Go to `Actions → k6 Load Tests → Run workflow`
2. Select options:
   - Test type: smoke, load, stress, spike, or soak
   - Site: platypus-au, platypus-nz, skechers-au, skechers-nz, drmartens-au, drmartens-nz, vans-au, vans-nz
   - VUs and duration (optional)

#### Scheduled Regression
Daily at 6 AM UTC (4 PM AEST):
- 20 VUs per site
- 5 minute duration
- All configured sites

### Resource Constraints

GitHub Actions runners have limits:
- **Memory**: 7 GB
- **CPU**: 2 cores
- **Timeout**: 6 hours max

Recommendations:
- Keep VUs ≤ 50 for reliable execution
- Use Grafana Cloud for >50 VUs
- Split long tests into multiple jobs

### Viewing Results

1. **Workflow Summary**: High-level pass/fail
2. **Artifacts**: Download JSON results
3. **Step Logs**: Detailed k6 output

```yaml
# Results uploaded as artifacts
- name: Upload test results
  uses: actions/upload-artifact@v4
  with:
    name: smoke-results-${{ matrix.site }}
    path: results-*.json
    retention-days: 30
```

---

## ☁️ Grafana Cloud Deployment

### Setup

1. **Create Grafana Cloud Account**
   - Go to https://grafana.com/products/cloud/
   - Sign up for free tier (includes k6 usage)

2. **Get API Token**
   - Navigate to: `k6 → Settings → API Tokens`
   - Create token with `Execute` permission
   - Save as `K6_CLOUD_TOKEN`

3. **Get Project ID**
   - Navigate to: `k6 → Projects`
   - Copy project ID
   - Save as `K6_CLOUD_PROJECT_ID`

### Local to Cloud

```bash
# Set environment variables
export K6_CLOUD_TOKEN=your_token_here
export K6_CLOUD_PROJECT_ID=your_project_id

# Run test on cloud
npm run test:cloud
# or
k6 cloud dist/tests/load.test.js
```

### Cloud Configuration

Configure cloud settings in test files:

```typescript
export const options: Options = {
  // Cloud-specific options
  ext: {
    loadimpact: {
      projectID: Number(__ENV.K6_CLOUD_PROJECT_ID) || 0,
      name: 'eCommerce Load Test',
      distribution: {
        'amazon:au:sydney': { loadZone: 'amazon:au:sydney', percent: 100 }
      }
    }
  },
  // Standard options
  vus: 100,
  duration: '10m',
};
```

### Load Zones

Available Australian load zones:

| Zone ID | Location | Latency to AU Sites |
|---------|----------|---------------------|
| `amazon:au:sydney` | Sydney, AU | ~5ms |
| `amazon:ap:singapore` | Singapore | ~100ms |
| `amazon:ap:tokyo` | Tokyo, Japan | ~150ms |

### Cloud Features

1. **Distributed Testing**
   - Multiple load zones
   - Geographic distribution
   - Real-world latency simulation

2. **Advanced Analytics**
   - Real-time dashboards
   - Trend analysis
   - Threshold violations

3. **Collaboration**
   - Shareable results
   - Team access
   - Comments & annotations

4. **Integrations**
   - Grafana dashboards
   - Slack notifications
   - PagerDuty alerts

### Pricing

Grafana Cloud k6 pricing (as of 2024):

| Tier | VU Hours/Month | Price |
|------|----------------|-------|
| Free | 500 | $0 |
| Pro | 5,000+ | ~$0.05/VU-hour |
| Enterprise | Unlimited | Contact sales |

Example costs:
- 100 VUs × 30 min = 50 VU-hours
- 500 VUs × 1 hour = 500 VU-hours
- 1000 VUs × 2 hours = 2000 VU-hours

---

## 💻 Local Deployment

### Prerequisites

```bash
# Install k6
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Running Locally

```bash
# Build first
npm run build

# Basic execution
k6 run dist/tests/load.test.js

# With environment variables
k6 run \
  --env SITE=platypus-au \
  --env ENVIRONMENT=staging \
  --vus 10 \
  --duration 5m \
  dist/tests/load.test.js

# With JSON output
k6 run --out json=results.json dist/tests/load.test.js

# With dashboard (web UI)
k6 run --out dashboard dist/tests/smoke.test.js
# Open http://localhost:5665
```

### Dashboard Mode

The k6 dashboard provides real-time visualization:

```bash
npm run dashboard
```

Features:
- Live request rate
- Response time graphs
- Error tracking
- Threshold status

### Output Formats

| Format | Command | Use Case |
|--------|---------|----------|
| Console | (default) | Quick view |
| JSON | `--out json=file.json` | Analysis |
| CSV | `--out csv=file.csv` | Spreadsheets |
| InfluxDB | `--out influxdb=...` | Grafana dashboards |
| Dashboard | `--out dashboard` | Real-time UI |

---

## 🔧 Environment Configuration

### Development

```bash
# .env.development
SITE=platypus-au
ENVIRONMENT=staging
VUS=5
DURATION=1m
DRY_RUN=true
```

### Staging

```bash
# .env.staging
SITE=platypus-au
ENVIRONMENT=staging
VUS=50
DURATION=10m
DRY_RUN=false
ENABLE_PLACE_ORDER=false
```

### Production

```bash
# .env.production
SITE=platypus-au
ENVIRONMENT=production
VUS=20
DURATION=5m
DRY_RUN=false
ENABLE_PLACE_ORDER=false
PRODUCTION_CONFIRMED=true
```

### Using Environment Files

```bash
# Load environment file
export $(cat .env.staging | xargs)
k6 run dist/tests/load.test.js

# Or inline
env $(cat .env.staging | xargs) k6 run dist/tests/load.test.js
```

---

## 📊 Comparison: GitHub Actions vs Grafana Cloud

### Feature Comparison

| Feature | GitHub Actions | Grafana Cloud |
|---------|---------------|---------------|
| **Max VUs** | ~50 (reliable) | 10,000+ |
| **Distributed Testing** | ❌ Single runner | ✅ Multiple zones |
| **Real-time Dashboard** | ❌ | ✅ |
| **Historical Trends** | ❌ | ✅ |
| **Geographic Distribution** | ❌ | ✅ |
| **Cost** | Free (within limits) | Pay per use |
| **Setup Complexity** | Low | Medium |
| **Integration** | Native GitHub | Webhook/API |
| **Test Duration** | 6 hours max | Unlimited |
| **Artifact Storage** | 90 days | Unlimited |

### When to Use Each

**GitHub Actions:**
- ✅ PR validation (smoke tests)
- ✅ Daily regression checks
- ✅ Small-scale load tests (<50 VUs)
- ✅ Teams already using GitHub
- ✅ Cost-sensitive projects

**Grafana Cloud:**
- ✅ Production load testing (>50 VUs)
- ✅ Stress testing
- ✅ Geographic distribution testing
- ✅ Performance trending over time
- ✅ Enterprise requirements

### Hybrid Approach (Recommended)

1. **GitHub Actions** for:
   - PR smoke tests (automatic)
   - Daily regression tests (scheduled)
   - Pre-merge validation

2. **Grafana Cloud** for:
   - Weekly/monthly load tests
   - Pre-release stress tests
   - Production capacity planning

```yaml
# Example: Trigger cloud test from GitHub Actions
cloud-test:
  runs-on: ubuntu-latest
  steps:
    - name: Run Cloud Test
      run: |
        k6 cloud \
          --env SITE=${{ inputs.site }} \
          dist/tests/load.test.js
      env:
        K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}
```

---

## 🔐 Security Considerations

### Secrets Management

| Secret | Storage | Access |
|--------|---------|--------|
| API Tokens | GitHub Secrets | Actions only |
| Test Credentials | Encrypted files | Build-time |
| Site URLs | Repository | Public |

### Test Data

⚠️ **Never commit real credentials**

```bash
# Add to .gitignore
src/data/*.secret.json
.env.local
.env.*.local
```

Use environment variables for sensitive data:

```typescript
const email = __ENV.TEST_USER_EMAIL || 'default@test.com';
const password = __ENV.TEST_USER_PASSWORD || 'defaultPassword';
```

### Production Safety

```typescript
// Built-in production guards
if (__ENV.ENVIRONMENT === 'production') {
  if (__ENV.PRODUCTION_CONFIRMED !== 'true') {
    throw new Error('Set PRODUCTION_CONFIRMED=true for production tests');
  }
  
  // Additional safeguards
  if (config.maxVUs > 50) {
    console.warn('High VU count on production - ensure approval');
  }
}
```

---

## 📈 Monitoring & Alerting

### GitHub Actions Notifications

```yaml
# Add to workflow
- name: Notify Slack on Failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    text: 'k6 Load Test Failed!'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Grafana Cloud Alerts

Configure in Grafana Cloud UI:
1. Navigate to Alerting → Alert rules
2. Create rule for threshold violations
3. Configure notification channels (Slack, Email, PagerDuty)

Example alert conditions:
- P95 response time > 1000ms for 5 minutes
- Error rate > 5% for 2 minutes
- Request rate drops > 50% suddenly

---

## 🔄 Continuous Integration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Development Workflow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Developer Push     PR Created       Merge to Main              │
│       │                 │                  │                    │
│       ▼                 ▼                  ▼                    │
│  ┌─────────┐      ┌──────────┐      ┌───────────┐              │
│  │ Build   │      │ Smoke    │      │ Regression│              │
│  │ Check   │      │ Tests    │      │ Tests     │              │
│  └────┬────┘      │ (GitHub) │      │ (GitHub)  │              │
│       │           └────┬─────┘      └─────┬─────┘              │
│       │                │                  │                    │
│       │           ┌────┴─────┐            │                    │
│       │           │ Pass?    │            │                    │
│       │           └────┬─────┘            │                    │
│       │                │                  │                    │
│       │           ┌────┴─────┐            │                    │
│       │           │ Merge OK │            │                    │
│       │           └──────────┘            │                    │
│       │                                   │                    │
│       └───────────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Release Workflow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Pre-Release         Release Day         Post-Release          │
│       │                   │                   │                 │
│       ▼                   ▼                   ▼                 │
│  ┌──────────┐       ┌──────────┐       ┌──────────┐            │
│  │ Load Test│       │ Smoke    │       │ Soak Test│            │
│  │ (Cloud)  │       │ Prod     │       │ (Cloud)  │            │
│  │ 100+ VUs │       │ 10 VUs   │       │ 4+ hours │            │
│  └────┬─────┘       └────┬─────┘       └────┬─────┘            │
│       │                  │                  │                   │
│       ▼                  ▼                  ▼                   │
│  ┌──────────┐       ┌──────────┐       ┌──────────┐            │
│  │ Review   │       │ Deploy   │       │ Capacity │            │
│  │ Results  │       │ Go/No-Go │       │ Planning │            │
│  └──────────┘       └──────────┘       └──────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `ENOMEM` | Out of memory | Reduce VUs, use Cloud |
| Timeout errors | Network issues | Check connectivity, increase timeout |
| High error rate | Rate limiting | Reduce requests, add delays |
| Inconsistent results | Warm-up missing | Add ramp-up stages |

### Debug Mode

```bash
# Verbose output
k6 run --verbose dist/tests/smoke.test.js

# HTTP debug
k6 run --http-debug dist/tests/smoke.test.js

# Full debug
k6 run --http-debug=full dist/tests/smoke.test.js
```

### Log Collection

```typescript
// Add detailed logging
import { Logger } from '@lib';

Logger.setLevel('debug');
Logger.debug('Request details', { url, headers, body });
```
