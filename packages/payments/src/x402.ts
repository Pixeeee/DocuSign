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
  error?: string
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
    }
  }

  const rpcUrl = process.env.X402_RPC_URL || 'https://sepolia.base.org'
  const parsedToken = parseX402Token(paymentToken)

  if (parsedToken) {
    const expectedAmountWei = parseEthAmount(amount)
    const expectedFrom = parsedToken.walletAddress.toLowerCase()
    const expectedTo = process.env.X402_WALLET_ADDRESS?.toLowerCase()

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

      const payload = await response.json()
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

      if (expectedTo && tx.to.toLowerCase() !== expectedTo) {
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

    const data = await response.json()

    return {
      valid: data.valid === true,
      paymentId: data.paymentId,
      txHash: data.txHash,
      amount: data.amount,
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
    const subscription = await prisma.subscription.findFirst({
      where: {
        teamId,
        status: 'active',
        currentPeriodEnd: { gt: new Date() },
        signaturesUsed: { lt: prisma.subscription.fields.signaturesLimit as any },
      },
    })

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