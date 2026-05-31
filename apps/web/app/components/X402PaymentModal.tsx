'use client'

import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider, parseEther, formatEther } from 'ethers'
import styles from './X402PaymentModal.module.css'

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type PaymentMethod = 'base' | 'stellar'

interface X402PaymentModalProps {
  show: boolean
  amount?: string
  stellarAmount?: string
  stellarDestination?: string
  stellarHorizonUrl?: string
  resource: string
  description: string
  onPaymentComplete: (paymentToken: string) => void
  onHide: () => void
}

const DEFAULT_X402_PRICE = '0.000091'
const DEFAULT_STELLAR_PRICE = '0.1'
const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'

function getDefaultAmount(): string {
  const envAmount = process.env.NEXT_PUBLIC_X402_PRICE_PER_SIGN
  return envAmount === DEFAULT_X402_PRICE ? envAmount : DEFAULT_X402_PRICE
}

function getDefaultStellarAmount(): string {
  return process.env.NEXT_PUBLIC_STELLAR_PRICE_PER_SIGN || DEFAULT_STELLAR_PRICE
}

function readFreighterBoolean(value: unknown, key: string): boolean {
  if (typeof value === 'boolean') return value
  if (value && typeof value === 'object' && key in value) {
    return Boolean((value as Record<string, unknown>)[key])
  }
  return false
}

function readFreighterString(value: unknown, key: string): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && key in value) {
    const nextValue = (value as Record<string, unknown>)[key]
    return typeof nextValue === 'string' ? nextValue : ''
  }
  return ''
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const BASE_SEPOLIA_CONFIG = {
  chainId: 84532,
  chainName: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  blockExplorerUrl: 'https://sepolia.basescan.org',
}

export default function X402PaymentModal({
  show,
  amount = getDefaultAmount(),
  stellarAmount = getDefaultStellarAmount(),
  stellarDestination = process.env.NEXT_PUBLIC_STELLAR_WALLET_ADDRESS || '',
  stellarHorizonUrl = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  resource,
  description,
  onPaymentComplete,
  onHide,
}: X402PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('base')
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [stellarAddress, setStellarAddress] = useState<string>('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState<string>('')
  const [stellarBalance, setStellarBalance] = useState<string>('')

  const handleCheckBalance = useCallback(async () => {
    if (!walletAddress) return

    try {
      const provider = new BrowserProvider(window.ethereum as EthereumProvider)
      const walletBalance = await provider.getBalance(walletAddress)
      setBalance(formatEther(walletBalance))
    } catch {
      setError('Failed to check Base wallet balance')
    }
  }, [walletAddress])

  const handleCheckStellarBalance = useCallback(async () => {
    if (!stellarAddress) return

    try {
      const StellarSdk = await import('@stellar/stellar-sdk')
      const server = new StellarSdk.Horizon.Server(stellarHorizonUrl)
      const account = await server.loadAccount(stellarAddress)
      const nativeBalance = account.balances.find((item) => item.asset_type === 'native')
      setStellarBalance(nativeBalance?.balance || '0')
    } catch {
      setError('Failed to check Stellar wallet balance')
    }
  }, [stellarAddress, stellarHorizonUrl])

  useEffect(() => {
    if (show && walletAddress && paymentMethod === 'base') {
      handleCheckBalance()
    }
    if (show && stellarAddress && paymentMethod === 'stellar') {
      handleCheckStellarBalance()
    }
  }, [show, walletAddress, stellarAddress, paymentMethod, handleCheckBalance, handleCheckStellarBalance])

  const switchToBaseSepolia = async (provider: BrowserProvider) => {
    try {
      await provider.send('wallet_switchEthereumChain', [
        { chainId: `0x${BASE_SEPOLIA_CONFIG.chainId.toString(16)}` },
      ])
    } catch (switchError) {
      const error = switchError as { code?: number; message?: string }
      if (error.code === 4902) {
        await provider.send('wallet_addEthereumChain', [
          {
            chainId: `0x${BASE_SEPOLIA_CONFIG.chainId.toString(16)}`,
            chainName: BASE_SEPOLIA_CONFIG.chainName,
            rpcUrls: [BASE_SEPOLIA_CONFIG.rpcUrl],
            nativeCurrency: BASE_SEPOLIA_CONFIG.nativeCurrency,
            blockExplorerUrls: [BASE_SEPOLIA_CONFIG.blockExplorerUrl],
          },
        ])
      } else {
        throw switchError
      }
    }
  }

  const connectBaseWallet = async () => {
    setIsConnecting(true)
    setError('')

    try {
      if (!window.ethereum) {
        setError('MetaMask or a compatible wallet was not found.')
        return
      }

      const provider = new BrowserProvider(window.ethereum as EthereumProvider)
      const accounts = (await provider.send('eth_requestAccounts', [])) as string[]
      setWalletAddress(accounts[0])
      await switchToBaseSepolia(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Base wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  const connectStellarWallet = async () => {
    setIsConnecting(true)
    setError('')

    try {
      const freighter = await import('@stellar/freighter-api')
      const connected = await freighter.isConnected()
      if (!readFreighterBoolean(connected, 'isConnected')) {
        setError('Freighter wallet extension was not found.')
        return
      }

      const allowed = await freighter.isAllowed()
      if (!readFreighterBoolean(allowed, 'isAllowed')) {
        await freighter.setAllowed()
      }

      const addressResult = await freighter.getAddress()
      const publicKey = readFreighterString(addressResult, 'address')
      if (!publicKey) {
        setError('Unable to read Freighter public key.')
        return
      }

      setStellarAddress(publicKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Freighter wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  const processBasePayment = async () => {
    if (!walletAddress) {
      setError('Base wallet is not connected')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const provider = new BrowserProvider(window.ethereum as EthereumProvider)
      const signer = await provider.getSigner()
      const tx = await signer.sendTransaction({
        to: process.env.NEXT_PUBLIC_X402_WALLET || '0xF5a795CacA94Ac1bDeEc36a52769Dae0d5E8DEF2',
        value: parseEther(amount),
      })
      const receipt = await tx.wait()

      if (receipt) {
        onPaymentComplete(`x402:${receipt.hash}:${walletAddress}:${amount}`)
        onHide()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Base payment failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const processStellarPayment = async () => {
    if (!stellarAddress) {
      setError('Freighter wallet is not connected')
      return
    }
    if (!stellarDestination) {
      setError('Stellar destination wallet is not configured')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const [freighter, StellarSdk] = await Promise.all([
        import('@stellar/freighter-api'),
        import('@stellar/stellar-sdk'),
      ])
      const server = new StellarSdk.Horizon.Server(stellarHorizonUrl)
      const account = await server.loadAccount(stellarAddress)
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: stellarDestination,
          asset: StellarSdk.Asset.native(),
          amount: stellarAmount,
        }))
        .setTimeout(180)
        .build()

      const signedResult = await freighter.signTransaction(transaction.toXDR(), {
        networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
        address: stellarAddress,
      })
      const signedXdr = readFreighterString(signedResult, 'signedTxXdr')
      if (!signedXdr) {
        setError('Freighter did not return a signed transaction.')
        return
      }

      const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
        signedXdr,
        STELLAR_TESTNET_PASSPHRASE
      )
      const result = await server.submitTransaction(signedTransaction)

      onPaymentComplete(`stellar:${result.hash}:${stellarAddress}:${stellarAmount}`)
      onHide()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stellar payment failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const hasInsufficientBaseBalance = !!balance && parseFloat(balance) < parseFloat(amount)
  const hasInsufficientStellarBalance = !!stellarBalance && parseFloat(stellarBalance) < parseFloat(stellarAmount)
  const isBase = paymentMethod === 'base'

  return (
    <>
      {show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h5 className={styles.modalTitle}>Payment Required</h5>
                <p className={styles.modalSubtitle}>Pay on Base Sepolia or Stellar testnet</p>
              </div>
              <button className={styles.closeButton} onClick={onHide} aria-label="Close">
                x
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && (
                <div className={`${styles.alert} ${styles.alertError}`} style={{ marginBottom: '20px' }}>
                  <div className={styles.alertText}>
                    <div className={styles.alertTitle}>Payment Error</div>
                    <div className={styles.alertDescription}>{error}</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <button
                  className={`${styles.button} ${isBase ? styles.buttonPrimary : styles.buttonSecondary}`}
                  onClick={() => setPaymentMethod('base')}
                  type="button"
                >
                  Base
                </button>
                <button
                  className={`${styles.button} ${!isBase ? styles.buttonPrimary : styles.buttonSecondary}`}
                  onClick={() => setPaymentMethod('stellar')}
                  type="button"
                >
                  Stellar
                </button>
              </div>

              <div className={styles.section} style={{ marginBottom: '24px' }}>
                <h6 className={styles.sectionTitle}>Payment Details</h6>
                <div className={styles.infoCard}>
                  <p className={styles.infoLabel}>Amount</p>
                  <p className={styles.infoValue}>{isBase ? `${amount} ETH` : `${stellarAmount} XLM`}</p>
                </div>
                <div className={styles.infoCard}>
                  <p className={styles.infoLabel}>Resource</p>
                  <p className={styles.infoValue}>{resource}</p>
                </div>
                <div className={styles.infoCard}>
                  <p className={styles.infoLabel}>Description</p>
                  <p className={styles.infoValue}>{description}</p>
                </div>
                <div className={styles.infoCard}>
                  <p className={styles.infoLabel}>Network</p>
                  <p className={styles.infoValue}>{isBase ? 'Base Sepolia' : 'Stellar Testnet'}</p>
                </div>
              </div>

              {isBase ? (
                !walletAddress ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={connectBaseWallet}
                      disabled={isConnecting}
                      style={{ width: '100%' }}
                    >
                      {isConnecting ? <><span className={styles.spinner} />Connecting...</> : 'Connect MetaMask Wallet'}
                    </button>
                    <small style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
                      Use MetaMask or another EVM wallet on Base Sepolia.
                    </small>
                  </div>
                ) : (
                  <div>
                    <div className={`${styles.statusIndicator} ${styles.statusConnected}`} style={{ marginBottom: '16px' }}>
                      <span className={`${styles.statusDot} ${styles.statusDotConnected}`} />
                      <span>Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                    </div>

                    {balance && (
                      <div className={styles.balanceRow} style={{ marginBottom: '16px' }}>
                        <span className={styles.balanceLabel}>Wallet Balance</span>
                        <span className={`${styles.balanceValue} ${hasInsufficientBaseBalance ? styles.balanceDanger : ''}`}>
                          {balance} ETH
                        </span>
                      </div>
                    )}

                    {hasInsufficientBaseBalance && (
                      <div className={`${styles.alert} ${styles.alertWarning}`} style={{ marginBottom: '16px' }}>
                        <div className={styles.alertText}>
                          <div className={styles.alertTitle}>Insufficient Balance</div>
                          <div className={styles.alertDescription}>
                            You need at least {amount} ETH to complete this payment.
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={processBasePayment}
                      disabled={isProcessing || hasInsufficientBaseBalance}
                      style={{ width: '100%' }}
                    >
                      {isProcessing ? <><span className={styles.spinner} />Processing...</> : `Pay ${amount} ETH`}
                    </button>
                  </div>
                )
              ) : !stellarAddress ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    className={`${styles.button} ${styles.buttonPrimary}`}
                    onClick={connectStellarWallet}
                    disabled={isConnecting}
                    style={{ width: '100%' }}
                  >
                    {isConnecting ? <><span className={styles.spinner} />Connecting...</> : 'Connect Freighter Wallet'}
                  </button>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
                    Freighter must be set up with a funded Stellar testnet account.
                  </small>
                </div>
              ) : (
                <div>
                  <div className={`${styles.statusIndicator} ${styles.statusConnected}`} style={{ marginBottom: '16px' }}>
                    <span className={`${styles.statusDot} ${styles.statusDotConnected}`} />
                    <span>Connected: {stellarAddress.slice(0, 6)}...{stellarAddress.slice(-4)}</span>
                  </div>

                  {stellarBalance && (
                    <div className={styles.balanceRow} style={{ marginBottom: '16px' }}>
                      <span className={styles.balanceLabel}>Wallet Balance</span>
                      <span className={`${styles.balanceValue} ${hasInsufficientStellarBalance ? styles.balanceDanger : ''}`}>
                        {stellarBalance} XLM
                      </span>
                    </div>
                  )}

                  <div className={styles.infoCard} style={{ marginBottom: '16px' }}>
                    <p className={styles.infoLabel}>Destination</p>
                    <p className={styles.infoValue}>{stellarDestination || 'Not configured'}</p>
                  </div>

                  {hasInsufficientStellarBalance && (
                    <div className={`${styles.alert} ${styles.alertWarning}`} style={{ marginBottom: '16px' }}>
                      <div className={styles.alertText}>
                        <div className={styles.alertTitle}>Insufficient Balance</div>
                        <div className={styles.alertDescription}>
                          You need at least {stellarAmount} XLM to complete this payment.
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    className={`${styles.button} ${styles.buttonPrimary}`}
                    onClick={processStellarPayment}
                    disabled={isProcessing || hasInsufficientStellarBalance || !stellarDestination}
                    style={{ width: '100%' }}
                  >
                    {isProcessing ? <><span className={styles.spinner} />Processing...</> : `Pay ${stellarAmount} XLM`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
