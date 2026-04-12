'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Modal, Alert, Spinner } from 'react-bootstrap'
import { BrowserProvider, parseEther, formatEther } from 'ethers'

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

      // For X402, we need to send ETH to trigger payment
      // In a real implementation, this would be a smart contract call
      // For testing, we'll simulate the payment

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
    <Modal show={show} onHide={onHide} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>Payment Required - X402</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="mb-4">
          <h6>Payment Details</h6>
          <p>
            <strong>Amount:</strong> {amount} ETH
          </p>
          <p>
            <strong>Resource:</strong> {resource}
          </p>
          <p>
            <strong>Description:</strong> {description}
          </p>
          <p>
            <strong>Network:</strong> Base Sepolia{' '}
            <a href={BASE_SEPOLIA_CONFIG.blockExplorerUrl} target="_blank" rel="noopener noreferrer">
              (Explorer)
            </a>
          </p>
        </div>

        {!walletAddress ? (
          <div className="d-grid gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={connectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Connecting...
                </>
              ) : (
                '🔗 Connect Wallet'
              )}
            </Button>
            <small className="text-muted">
              Make sure you have MetaMask or a compatible Web3 wallet installed.
            </small>
          </div>
        ) : (
          <div>
            <div className="alert alert-info mb-3">
              <strong>Connected:</strong> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </div>

            {balance && (
              <p className="mb-3">
                <strong>Balance:</strong> {balance} ETH
              </p>
            )}

            <div className="d-grid gap-2">
              <Button
                variant="success"
                size="lg"
                onClick={processPayment}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Processing Payment...
                  </>
                ) : (
                  `💳 Pay ${amount} ETH`
                )}
              </Button>
            </div>

            <Button
              variant="outline-secondary"
              className="mt-2 w-100"
              onClick={() => {
                setWalletAddress('')
                setBalance('')
              }}
            >
              Disconnect Wallet
            </Button>
          </div>
        )}
      </Modal.Body>
    </Modal>
  )
}
