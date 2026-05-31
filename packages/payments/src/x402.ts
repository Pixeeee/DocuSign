/**
 * X402 v2 Payment Integration
 * Protocol: HTTP 402 Payment Required
 * Chain: Base (chainId 8453)
 */

export interface X402PaymentHeader {
  scheme: 'exact'
  network: string
  maxAmountRequired: string
  resource: string
  description: string
  mimeType: string
  payTo: string
  maxTimeoutSeconds: number
  asset: string
  extra?: {
    name: string
    version: string
  }
}

export interface X402VerifyResult {
  valid: boolean
  paymentId?: string
  txHash?: string
  amount?: string
  currency?: string
  error?: string
}

export interface StellarPaymentOption {
  scheme: 'stellar-classic'
  network: 'stellar:testnet' | 'stellar:pubnet'
  amount: string
  currency: 'XLM'
  resource: string
  description: string
  payTo: string
  horizonUrl: string
  maxTimeoutSeconds: number
}

/**
 * Build the WWW-Authenticate header for 402 responses
 */
export function buildX402Header(
  resource: string,
  priceEth = '0.000091',
  walletAddress?: string
): X402PaymentHeader {
  return {
    scheme: 'exact',
    network: `eip155:${process.env.X402_CHAIN_ID || '8453'}`,
    maxAmountRequired: priceEth,
    resource,
    description: `Sign document: ${resource}`,
    mimeType: 'application/pdf',
    payTo: walletAddress || process.env.X402_WALLET_ADDRESS || '',
    maxTimeoutSeconds: 300,
    asset: `eip155:${process.env.X402_CHAIN_ID || '8453'}/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, // USDC on Base
    extra: {
      name: 'ESIGN Platform',
      version: '2.0',
    },
  }
}

export function buildStellarPaymentOption(
  resource: string,
  amountXlm = '0.1',
  walletAddress?: string
): StellarPaymentOption {
  const network = (process.env.STELLAR_NETWORK || 'testnet') === 'pubnet'
    ? 'stellar:pubnet'
    : 'stellar:testnet'

  return {
    scheme: 'stellar-classic',
    network,
    amount: amountXlm,
    currency: 'XLM',
    resource,
    description: `Sign document: ${resource}`,
    payTo: walletAddress || process.env.STELLAR_WALLET_ADDRESS || '',
    horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
    maxTimeoutSeconds: 300,
  }
}

/**
 * Verify payment with X402 facilitator
 */
function parseX402Token(paymentToken: string) {
  if (!paymentToken.startsWith('x402:')) return null
  const parts = paymentToken.split(':')
  if (parts.length !== 4) return null

  const [, txHash, walletAddress, amount] = parts
  return { txHash, walletAddress, amount }
}

function parseEthAmount(amount: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(amount)
  if (!match) {
    throw new Error('Invalid ETH amount format')
  }

  const whole = BigInt(match[1])
  const fraction = (match[2] ?? '').padEnd(18, '0')
  if (fraction.length > 18) {
    throw new Error('ETH amount has too many decimal places')
  }

  return whole * 10n ** 18n + BigInt(fraction)
}

function toHex(value: bigint): string {
  return `0x${value.toString(16)}`
}

export async function verifyX402Payment(
  paymentToken: string,
  resource: string,
  amount: string
): Promise<X402VerifyResult> {
  // In development mode, accept any payment token (mock verification)
  if (process.env.NODE_ENV === 'development') {
    console.log('[X402] Development mode: simulating payment verification')
    return {
      valid: true,
      paymentId: `dev-${Date.now()}`,
      txHash: `0x${'a'.repeat(64)}`,
      amount,
      currency: 'ETH',
    }
  }

  const rpcUrl = process.env.X402_RPC_URL || 'https://sepolia.base.org'
  const parsedToken = parseX402Token(paymentToken)

  if (parsedToken) {
    const expectedAmountWei = parseEthAmount(amount)
    const expectedFrom = parsedToken.walletAddress.toLowerCase()
    const expectedTo = process.env.X402_WALLET_ADDRESS?.toLowerCase()

    if (!expectedTo) {
      return { valid: false, error: 'X402_WALLET_ADDRESS is not configured' }
    }

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionByHash',
          params: [parsedToken.txHash],
        }),
      })

      if (!response.ok) {
        return { valid: false, error: `RPC provider returned ${response.status}` }
      }

      const payload: any = await response.json()
      const tx = payload.result

      if (!tx) {
        return { valid: false, error: 'Transaction not found or not yet mined' }
      }

      if (!tx.from || tx.from.toLowerCase() !== expectedFrom) {
        return { valid: false, error: 'Transaction sender does not match payment token' }
      }

      if (!tx.to) {
        return { valid: false, error: 'Transaction recipient is missing' }
      }

      if (tx.to.toLowerCase() !== expectedTo) {
        return { valid: false, error: 'Transaction recipient does not match configured X402 wallet' }
      }

      const txValue = BigInt(tx.value)
      if (txValue !== expectedAmountWei) {
        return {
          valid: false,
          error: `Transaction value does not match required amount (${amount} ETH)`,
        }
      }

      if (tx.blockNumber === null) {
        return { valid: false, error: 'Transaction is not yet mined' }
      }

      return {
        valid: true,
        paymentId: parsedToken.txHash,
        txHash: parsedToken.txHash,
        amount,
        currency: 'ETH',
      }
    } catch (error: any) {
      return { valid: false, error: error.message }
    }
  }

  const facilitatorUrl = process.env.X402_FACILITATOR_URL || 'https://facilitator.coinbase.com'

  try {
    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment: paymentToken,
        resource,
        amount,
        network: `eip155:${process.env.X402_CHAIN_ID || '84532'}`,
      }),
    })

    if (!response.ok) {
      return { valid: false, error: `Facilitator error: ${response.status}` }
    }

    const data: any = await response.json()

    return {
      valid: data.valid === true,
      paymentId: data.paymentId,
      txHash: data.txHash,
      amount: data.amount,
      currency: 'ETH',
    }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}

function parseStellarToken(paymentToken: string) {
  if (!paymentToken.startsWith('stellar:')) return null
  const parts = paymentToken.split(':')
  if (parts.length !== 4) return null

  const [, txHash, walletAddress, amount] = parts
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return null
  if (!/^G[A-Z2-7]{55}$/.test(walletAddress)) return null
  return { txHash, walletAddress, amount }
}

function normalizeXlmAmount(amount: string): string {
  const match = /^([0-9]+)(?:\.([0-9]{1,7})?)?$/.exec(amount)
  if (!match) throw new Error('Invalid XLM amount format')
  const whole = match[1].replace(/^0+(?=\d)/, '')
  const fraction = (match[2] || '').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export async function verifyStellarPayment(
  paymentToken: string,
  _resource: string,
  amount: string
): Promise<X402VerifyResult> {
  const parsedToken = parseStellarToken(paymentToken)
  if (!parsedToken) {
    return { valid: false, error: 'Invalid Stellar payment token' }
  }

  const expectedTo = process.env.STELLAR_WALLET_ADDRESS
  if (!expectedTo) {
    return { valid: false, error: 'STELLAR_WALLET_ADDRESS is not configured' }
  }

  let expectedAmount: string
  try {
    expectedAmount = normalizeXlmAmount(amount)
  } catch (error: any) {
    return { valid: false, error: error.message }
  }

  try {
    if (normalizeXlmAmount(parsedToken.amount) !== expectedAmount) {
      return { valid: false, error: 'Payment token amount does not match required amount' }
    }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }

  const horizonUrl = (process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org').replace(/\/$/, '')

  try {
    const [txResponse, opsResponse] = await Promise.all([
      fetch(`${horizonUrl}/transactions/${parsedToken.txHash}`),
      fetch(`${horizonUrl}/transactions/${parsedToken.txHash}/operations?limit=200`),
    ])

    if (!txResponse.ok) {
      return { valid: false, error: `Stellar transaction lookup failed: ${txResponse.status}` }
    }
    if (!opsResponse.ok) {
      return { valid: false, error: `Stellar operation lookup failed: ${opsResponse.status}` }
    }

    const tx: any = await txResponse.json()
    const ops: any = await opsResponse.json()
    const operation = ops?._embedded?.records?.find((op: any) =>
      op.type === 'payment' &&
      op.from === parsedToken.walletAddress &&
      op.to === expectedTo &&
      op.asset_type === 'native' &&
      normalizeXlmAmount(op.amount) === expectedAmount
    )

    if (!tx.successful || !operation) {
      return { valid: false, error: 'Matching Stellar payment operation was not found' }
    }

    const createdAt = Date.parse(tx.created_at)
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000) {
      return { valid: false, error: 'Stellar payment is too old' }
    }

    return {
      valid: true,
      paymentId: `stellar:${parsedToken.txHash}`,
      txHash: parsedToken.txHash,
      amount: expectedAmount,
      currency: 'XLM',
    }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}

/**
 * Check if user has an active subscription that covers signing
 */
export async function checkSubscriptionCoverage(
  userId: string,
  teamId?: string | null
): Promise<boolean> {
  const { prisma } = await import('@esign/db')

  // Check individual plan
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.plan === 'TEAM' || user?.plan === 'ENTERPRISE') return true

  // Check team subscription
  if (teamId) {
    const member = await prisma.teamMember.findFirst({
      where: { teamId, userId },
      select: { id: true },
    })

    if (!member) return false

    const subscriptions = await prisma.subscription.findMany({
      where: {
        teamId,
        status: 'active',
        currentPeriodEnd: { gt: new Date() },
      },
      orderBy: { currentPeriodEnd: 'desc' },
    })
    const subscription = subscriptions.find((item: any) => item.signaturesUsed < item.signaturesLimit)

    if (subscription) {
      // Increment usage counter
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { signaturesUsed: { increment: 1 } },
      })
      return true
    }
  }

  return false
}
