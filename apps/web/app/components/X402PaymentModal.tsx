'use client'

import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider, parseEther, formatEther } from 'ethers'
import styles from './X402PaymentModal.module.css'

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

interface X402PaymentModalProps {
  show: boolean
  amount?: string // in ETH, defaults to environment variable
  resource: string
  description: string
  onPaymentComplete: (paymentToken: string) => void
  onHide: () => void
}

const DEFAULT_X402_PRICE = '0.000091'

function getDefaultAmount(): string {
  const envAmount = process.env.NEXT_PUBLIC_X402_PRICE_PER_SIGN
  return envAmount === DEFAULT_X402_PRICE ? envAmount : DEFAULT_X402_PRICE
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
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base Sepolia
}

export default function X402PaymentModal({
  show,
  amount = getDefaultAmount(),
  resource,
  description,
  onPaymentComplete,
  onHide,
}: X402PaymentModalProps) {
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState<string>('')

  const handleCheckBalance = useCallback(async () => {
    if (!walletAddress) return

    try {
      const provider = new BrowserProvider(window.ethereum as EthereumProvider)
      const balance = await provider.getBalance(walletAddress)
      setBalance(formatEther(balance))
    } catch {
      setError('Failed to check balance')
    }
  }, [walletAddress])

  useEffect(() => {
    if (show && walletAddress) {
      handleCheckBalance()
    }
  }, [show, walletAddress, handleCheckBalance])

  const connectWallet = async () => {
    setIsConnecting(true)
    setError('')

    try {
      if (!window.ethereum) {
        setError('MetaMask or compatible wallet not found. Please install it.')
        setIsConnecting(false)
        return
      }

      const provider = new BrowserProvider(window.ethereum as EthereumProvider)
      const accounts = (await provider.send('eth_requestAccounts', [])) as string[]
      setWalletAddress(accounts[0])

      // Ensure user is on Base Sepolia
      await switchToBaseSepolia(provider)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }

  const switchToBaseSepolia = async (provider: BrowserProvider) => {
    try {
      await provider.send('wallet_switchEthereumChain', [
        { chainId: `0x${BASE_SEPOLIA_CONFIG.chainId.toString(16)}` },
      ])
    } catch (switchError) {
      const error = switchError as { code?: number; message?: string }
      if (error.code === 4902) {
        // Chain not added, add it
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

  const processPayment = async () => {
    if (!walletAddress) {
      setError('Wallet not connected')
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
        // Generate payment token based on transaction hash
        const paymentToken = `x402:${receipt.hash}:${walletAddress}:${amount}`

        onPaymentComplete(paymentToken)
        onHide()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed'
      setError(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      {show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h5 className={styles.modalTitle}>Payment Required - X402</h5>
                <p className={styles.modalSubtitle}>Blockchain-based payment processing</p>
              </div>
              <button
                className={styles.closeButton}
                onClick={onHide}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && (
                <div className={`${styles.alert} ${styles.alertError}`} style={{ marginBottom: '20px' }}>
                  <span className={styles.alertIcon}>⚠️</span>
                  <div className={styles.alertText}>
                    <div className={styles.alertTitle}>Payment Error</div>
                    <div className={styles.alertDescription}>{error}</div>
                  </div>
                </div>
              )}

              <div className={styles.section} style={{ marginBottom: '24px' }}>
                <h6 className={styles.sectionTitle}>💰 Payment Details</h6>
                <div className={styles.infoCard}>
                  <p className={styles.infoLabel}>Amount</p>
                  <p className={styles.infoValue}>{amount} ETH</p>
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
                  <p className={styles.infoValue}>
                    Base Sepolia{' '}
                    <a
                      href={BASE_SEPOLIA_CONFIG.blockExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-success)', textDecoration: 'none', fontWeight: '500' }}
                    >
                      (Explorer ↗)
                    </a>
                  </p>
                </div>
              </div>

              {!walletAddress ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    className={`${styles.button} ${styles.buttonPrimary}`}
                    onClick={connectWallet}
                    disabled={isConnecting}
                    style={{ width: '100%' }}
                  >
                    {isConnecting ? (
                      <>
                        <span className={styles.spinner} />
                        Connecting...
                      </>
                    ) : (
                      '🔗 Connect MetaMask Wallet'
                    )}
                  </button>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
                    Make sure you have MetaMask or a compatible Web3 wallet installed.
                  </small>
                </div>
              ) : (
                <div>
                  <div className={`${styles.statusIndicator} ${styles.statusConnected}`} style={{ marginBottom: '16px' }}>
                    <span className={`${styles.statusDot} ${styles.statusDotConnected}`} />
                    <span>
                      Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </span>
                  </div>

                  {balance && (
                    <div className={styles.balanceRow} style={{ marginBottom: '16px' }}>
                      <span className={styles.balanceLabel}>Wallet Balance</span>
                      <span className={`${styles.balanceValue} ${parseFloat(balance) < parseFloat(amount) ? styles.balanceDanger : ''}`}>
                        {balance} ETH
                      </span>
                    </div>
                  )}

                  {parseFloat(balance) < parseFloat(amount) && (
                    <div className={`${styles.alert} ${styles.alertWarning}`} style={{ marginBottom: '16px' }}>
                      <span className={styles.alertIcon}>⚠️</span>
                      <div className={styles.alertText}>
                        <div className={styles.alertTitle}>Insufficient Balance</div>
                        <div className={styles.alertDescription}>
                          You need at least {amount} ETH in your wallet to complete this payment.
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={processPayment}
                      disabled={isProcessing || parseFloat(balance) < parseFloat(amount)}
                      style={{ width: '100%' }}
                    >
                      {isProcessing ? (
                        <>
                          <span className={styles.spinner} />
                          Processing Payment...
                        </>
                      ) : (
                        `💳 Pay ${amount} ETH`
                      )}
                    </button>

                    <button
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      onClick={() => {
                        setWalletAddress('')
                        setBalance('')
                      }}
                      style={{ width: '100%' }}
                    >
                      Disconnect Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}