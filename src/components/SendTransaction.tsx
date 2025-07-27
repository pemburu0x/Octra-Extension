import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Send, AlertTriangle, Wallet as WalletIcon, CheckCircle, ExternalLink, Copy, MessageSquare, Calculator, Globe, Loader2 } from 'lucide-react';
import { Wallet } from '../types/wallet';
import { fetchBalance, sendTransaction, createTransaction } from '../utils/api';
import { validateRecipientInput, resolveRecipientAddress } from '../utils/ons';
import { useToast } from '@/hooks/use-toast';

interface SendTransactionProps {
  wallet: Wallet | null;
  balance: number | null;
  nonce: number;
  onBalanceUpdate: (balance: number) => void;
  onNonceUpdate: (nonce: number) => void;
  onTransactionSuccess: () => void;
}

export function SendTransaction({ wallet, balance, nonce, onBalanceUpdate, onNonceUpdate, onTransactionSuccess }: SendTransactionProps) {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [recipientType, setRecipientType] = useState<'address' | 'ons' | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; hash?: string; error?: string } | null>(null);
  const { toast } = useToast();

  // Resolve recipient address when input changes
  useEffect(() => {
    const resolveRecipient = async () => {
      if (!recipientAddress.trim()) {
        setResolvedAddress(null);
        setRecipientType(null);
        setResolutionError(null);
        return;
      }

      const validation = validateRecipientInput(recipientAddress);
      if (!validation.isValid) {
        setResolvedAddress(null);
        setRecipientType(null);
        setResolutionError(validation.error || 'Invalid input');
        return;
      }

      if (validation.type === 'address') {
        setResolvedAddress(recipientAddress.trim());
        setRecipientType('address');
        setResolutionError(null);
        return;
      }

      if (validation.type === 'ons') {
        setIsResolving(true);
        setResolutionError(null);
        
        try {
          const resolution = await resolveRecipientAddress(recipientAddress);
          if (resolution.address) {
            setResolvedAddress(resolution.address);
            setRecipientType('ons');
            setResolutionError(null);
          } else {
            setResolvedAddress(null);
            setRecipientType('ons');
            setResolutionError(resolution.error || 'Failed to resolve ONS domain');
          }
        } catch (error) {
          setResolvedAddress(null);
          setRecipientType('ons');
          setResolutionError('Failed to resolve ONS domain');
        } finally {
          setIsResolving(false);
        }
      }
    };

    const timeoutId = setTimeout(resolveRecipient, 500);
    return () => clearTimeout(timeoutId);
  }, [recipientAddress]);

  const validateAmount = (amountStr: string) => {
    const num = parseFloat(amountStr);
    return !isNaN(num) && num > 0;
  };

  const calculateFee = (amount: number) => {
    // Fee calculation based on CLI logic: 0.001 for < 1000, 0.003 for >= 1000
    return amount < 1000 ? 0.001 : 0.003;
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Copy failed",
        variant: "destructive",
      });
    }
  };

  const handleSend = async () => {
    if (!wallet) {
      toast({
        title: "Error",
        description: "No wallet connected",
        variant: "destructive",
      });
      return;
    }

    const finalRecipientAddress = resolvedAddress;
    
    if (!finalRecipientAddress) {
      toast({
        title: "Error",
        description: resolutionError || "Invalid recipient address",
        variant: "destructive",
      });
      return;
    }

    if (!validateAmount(amount)) {
      toast({
        title: "Error",
        description: "Invalid amount",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    const fee = calculateFee(amountNum);
    const totalCost = amountNum + fee;

    if (balance !== null && totalCost > balance) {
      toast({
        title: "Error",
        description: `Insufficient balance. Need ${totalCost.toFixed(8)} OCT (${amountNum.toFixed(8)} + ${fee.toFixed(8)} fee)`,
        variant: "destructive",
      });
      return;
    }

    // Validate message length (max 1024 characters like CLI)
    if (message && message.length > 1024) {
      toast({
        title: "Error",
        description: "Message too long (max 1024 characters)",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      // Refresh nonce before sending like CLI does
      const freshBalanceData = await fetchBalance(wallet.address);
      const currentNonce = freshBalanceData.nonce;

      const transaction = createTransaction(
        wallet.address,
        finalRecipientAddress,
        amountNum,
        currentNonce + 1,
        wallet.privateKey,
        wallet.publicKey || '',
        message || undefined
      );

      const sendResult = await sendTransaction(transaction);

      setResult(sendResult);

      if (sendResult.success) {
        toast({
          title: "Transaction Sent!",
          description: "Transaction has been submitted successfully",
        });

        // Reset form
        setRecipientAddress('');
        setAmount('');
        setMessage('');

        // Update nonce
        onNonceUpdate(currentNonce + 1);

        // Update balance after successful transaction
        setTimeout(async () => {
          try {
            const updatedBalance = await fetchBalance(wallet.address);
            onBalanceUpdate(updatedBalance.balance);
            onNonceUpdate(updatedBalance.nonce);
          } catch (error) {
            console.error('Failed to refresh balance after transaction:', error);
          }
        }, 2000);

        onTransactionSuccess();
      } else {
        toast({
          title: "Transaction Failed",
          description: sendResult.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Send transaction error:', error);
      toast({
        title: "Error",
        description: "Failed to send transaction",
        variant: "destructive",
      });
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!wallet) {
    return (
      <Alert>
        <div className="flex items-start space-x-3">
          <WalletIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <AlertDescription>
            No wallet available. Please generate or import a wallet first.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  const amountNum = parseFloat(amount) || 0;
  const fee = calculateFee(amountNum);
  const totalCost = amountNum + fee;
  const currentBalance = balance || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Send Transaction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <AlertDescription>
              Double-check the recipient address before sending. Transactions cannot be reversed.
            </AlertDescription>
          </div>
        </Alert>

        {/* Wallet Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>From Address</Label>
            <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
              {wallet.address}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Current Balance</Label>
            <div className="p-3 bg-muted rounded-md font-mono text-sm">
              {currentBalance.toFixed(8)} OCT
            </div>
          </div>
        </div>

        {/* Recipient Address */}
        <div className="space-y-2">
          <Label htmlFor="recipient">Recipient Address</Label>
          <Input
            id="recipient"
            placeholder="oct... or domain.oct"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            className="font-mono"
          />
          
          {/* Recipient Status */}
          {isResolving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Resolving ONS domain...
            </div>
          )}
          
          {recipientType && !isResolving && (
            <div className="space-y-2">
              {recipientType === 'address' && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">Valid Octra address</span>
                </div>
              )}
              
              {recipientType === 'ons' && resolvedAddress && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-blue-600">ONS domain resolved</span>
                  </div>
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded text-sm">
                    <span className="text-muted-foreground">Resolves to:</span>
                    <div className="font-mono text-xs break-all mt-1">{resolvedAddress}</div>
                  </div>
                </div>
              )}
              
              {resolutionError && (
                <div className="text-sm text-red-600 mt-1">{resolutionError}</div>
              )}
            </div>
          )}
          
          {recipientAddress.trim() && !recipientType && !isResolving && resolutionError && (
            <div className="text-sm text-red-600 mt-1">{resolutionError}</div>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ( OCT )</Label>
          <Input
            id="amount"
            type="number"
            placeholder="0.00000000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.1"
            min="0"
          />
          {amount && !validateAmount(amount) && (
            <p className="text-sm text-red-600">Invalid amount</p>
          )}
        </div>

        {/* Message Field */}
        <div className="space-y-2">
          <Label htmlFor="message" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Message ( Optional )
          </Label>
          <Textarea
            id="message"
            placeholder="Enter an optional message (max 1024 characters)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1024}
            rows={3}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>This message will be included in the transaction</span>
            <span>{message.length}/1024</span>
          </div>
        </div>

        {/* Fee Calculation */}
        {amount && validateAmount(amount) && (
          <div className="p-3 bg-muted rounded-md space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator className="h-4 w-4" />
              Fee Calculation
            </div>
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span>Amount:</span>
                <span className="font-mono">{amountNum.toFixed(8)} OCT</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Fee ({amountNum < 1000 ? '< 1000' : '≥ 1000'} OCT):</span>
                <span className="font-mono">{fee.toFixed(8)} OCT</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center font-medium">
                <span>Total Cost:</span>
                <span className="font-mono">{totalCost.toFixed(8)} OCT</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Remaining Balance:</span>
                <span className={`font-mono ${currentBalance - totalCost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(currentBalance - totalCost).toFixed(8)} OCT
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Fee structure: 0.001 OCT for amounts &lt; 1000, 0.003 OCT for amounts ≥ 1000
              </div>
            </div>
          </div>
        )}

        {/* Transaction Result */}
        {result && (
          <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 border border-green-200 dark:bg-green-950/50 dark:border-green-800' : 'bg-red-50 border border-red-200 dark:bg-red-950/50 dark:border-red-800'}`}>
            <div className="flex items-start space-x-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-2 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                  {result.success ? 'Transaction Sent Successfully!' : 'Transaction Failed'}
                </p>
                {result.success && result.hash && (
                  <div className="mt-2">
                    <p className="text-green-700 dark:text-green-300 text-sm">Transaction Hash:</p>
                    <div className="flex flex-col sm:flex-row sm:items-center mt-1 space-y-1 sm:space-y-0 sm:space-x-2">
                      <code className="text-xs bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded font-mono break-all text-green-800 dark:text-green-200 flex-1">
                        {result.hash}
                      </code>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(result.hash!, 'Transaction Hash')}
                          className="h-6 w-6 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <a
                          href={`https://octrascan.io/tx/${result.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-6 w-6 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                          title="View on OctraScan"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
                {result.error && (
                  <p className="text-red-700 dark:text-red-300 text-sm mt-1 break-words">{result.error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <Button 
          onClick={handleSend}
          disabled={
            isSending || 
            !resolvedAddress || 
            isResolving ||
            !validateAmount(amount) || 
            totalCost > currentBalance ||
            Boolean(message && message.length > 1024)
          }
          className="w-full"
          size="lg"
        >
          {isSending ? "Sending..." : `Send ${amountNum.toFixed(8)} OCT`}
        </Button>
      </CardContent>
    </Card>
  );
}