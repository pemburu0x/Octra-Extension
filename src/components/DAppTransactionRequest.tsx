import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink, Shield, Send, X, Check, AlertTriangle, Calculator, MessageSquare } from 'lucide-react';
import { Wallet, DAppTransactionRequest } from '../types/wallet';
import { fetchBalance, sendTransaction, createTransaction } from '../utils/api';
import { validateRecipientInput, resolveRecipientAddress } from '../utils/ons';
import { useToast } from '@/hooks/use-toast';

interface DAppTransactionRequestProps {
  transactionRequest: DAppTransactionRequest;
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  connectedWallet?: Wallet | null;
  onWalletSelect: (wallet: Wallet) => void;
  onApprove: (txHash: string) => void;
  onReject: () => void;
}

export function TransactionRequestDialog({ 
  transactionRequest, 
  wallets, 
  selectedWallet, 
  connectedWallet,
  onWalletSelect, 
  onApprove, 
  onReject 
}: DAppTransactionRequestProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [resolvedToAddress, setResolvedToAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const { toast } = useToast();

  // Resolve the 'to' address when component mounts
  useEffect(() => {
    const resolveToAddress = async () => {
      if (!transactionRequest.to) return;
      
      const validation = validateRecipientInput(transactionRequest.to);
      if (!validation.isValid) {
        setResolvedToAddress(transactionRequest.to); // Use as-is if invalid
        return;
      }
      
      if (validation.type === 'address') {
        setResolvedToAddress(transactionRequest.to);
        return;
      }
      
      if (validation.type === 'ons') {
        setIsResolvingAddress(true);
        try {
          const resolution = await resolveRecipientAddress(transactionRequest.to);
          setResolvedToAddress(resolution.address || transactionRequest.to);
        } catch (error) {
          setResolvedToAddress(transactionRequest.to); // Fallback to original
        } finally {
          setIsResolvingAddress(false);
        }
      }
    };
    
    resolveToAddress();
  }, [transactionRequest.to]);

  // Fetch balance when wallet is selected
  useEffect(() => {
    if (selectedWallet) {
      setIsLoadingBalance(true);
      fetchBalance(selectedWallet.address)
        .then(data => {
          setBalance(data.balance);
          setNonce(data.nonce);
        })
        .catch(error => {
          console.error('Failed to fetch balance:', error);
          toast({
            title: "Error",
            description: "Failed to fetch wallet balance",
            variant: "destructive",
          });
        })
        .finally(() => setIsLoadingBalance(false));
    }
  }, [selectedWallet, toast]);

  const calculateFee = (amount: number) => {
    return amount < 1000 ? 0.001 : 0.003;
  };

  const handleApprove = async () => {
    if (!selectedWallet) {
      toast({
        title: "No Wallet Selected",
        description: "Please select a wallet to send the transaction",
        variant: "destructive",
      });
      return;
    }

    if (balance === null) {
      toast({
        title: "Balance Unknown",
        description: "Unable to verify wallet balance",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(transactionRequest.amount);
    const fee = calculateFee(amount);
    const totalCost = amount + fee;

    if (totalCost > balance) {
      toast({
        title: "Insufficient Balance",
        description: `Need ${totalCost.toFixed(8)} OCT (${amount.toFixed(8)} + ${fee.toFixed(8)} fee), but only have ${balance.toFixed(8)} OCT`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Refresh nonce before sending
      const freshBalanceData = await fetchBalance(selectedWallet.address);
      const currentNonce = freshBalanceData.nonce;

      const transaction = createTransaction(
        selectedWallet.address,
        resolvedToAddress || transactionRequest.to,
        amount,
        currentNonce + 1,
        selectedWallet.privateKey,
        selectedWallet.publicKey || '',
        transactionRequest.message || undefined
      );

      const result = await sendTransaction(transaction);

      if (result.success && result.hash) {
        toast({
          title: "Transaction Sent!",
          description: "Transaction has been submitted successfully",
        });
        onApprove(result.hash);
      } else {
        toast({
          title: "Transaction Failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Transaction error:', error);
      toast({
        title: "Error",
        description: "Failed to send transaction",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = () => {
    setIsProcessing(true);
    onReject();
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const amount = parseFloat(transactionRequest.amount);
  const fee = calculateFee(amount);
  const totalCost = amount + fee;
  const currentBalance = balance || 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {transactionRequest.appIcon ? (
                <Avatar className="h-16 w-16">
                  <AvatarImage src={transactionRequest.appIcon} />
                  <AvatarFallback>
                    {transactionRequest.appName?.charAt(0) || 'A'}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center">
                  <Send className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>
            <CardTitle className="text-xl">
              {transactionRequest.appName || 'Unknown App'} wants to send a transaction
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {transactionRequest.origin}
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Transaction Details */}
            <div className="space-y-3">
              <h3 className="font-medium">Transaction Details</h3>
              <div className="space-y-2 p-3 bg-muted rounded-md">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">To:</span>
                  <div className="text-right">
                    <span className="font-mono text-sm">{truncateAddress(transactionRequest.to)}</span>
                    {resolvedToAddress && resolvedToAddress !== transactionRequest.to && (
                      <div className="text-xs text-muted-foreground font-mono">
                        → {truncateAddress(resolvedToAddress)}
                      </div>
                    )}
                    {isResolvingAddress && (
                      <div className="text-xs text-muted-foreground">Resolving...</div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Amount:</span>
                  <span className="font-mono font-bold">{amount.toFixed(8)} OCT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Fee:</span>
                  <span className="font-mono text-sm">{fee.toFixed(8)} OCT</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center font-medium">
                  <span className="text-sm">Total Cost:</span>
                  <span className="font-mono">{totalCost.toFixed(8)} OCT</span>
                </div>
                {transactionRequest.message && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Message:</span>
                      </div>
                      <div className="p-2 bg-background rounded text-sm break-all">
                        {transactionRequest.message}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Wallet Selection */}
            <div className="space-y-3">
              <h3 className="font-medium">
                {connectedWallet ? 'Connected Account' : 'Select Account'}
              </h3>
              {connectedWallet && (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    This dApp is connected to your wallet. Using the previously selected account.
                  </AlertDescription>
                </Alert>
              )}
              <div className="max-h-[150px] w-full overflow-y-auto rounded-md border">
                <div className="p-2 space-y-2">
                  {connectedWallet ? (
                    // Show only the connected wallet
                    <div
                      className="p-3 border border-primary bg-primary/5 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Connected Account</div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {truncateAddress(connectedWallet.address)}
                          </div>
                          {balance !== null && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Balance: {balance.toFixed(8)} OCT
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-primary" />
                          {isLoadingBalance && (
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Show all wallets for selection
                    wallets.map((wallet, index) => (
                    <div
                      key={wallet.address}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedWallet?.address === wallet.address
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => onWalletSelect(wallet)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Account {index + 1}</div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {truncateAddress(wallet.address)}
                          </div>
                          {selectedWallet?.address === wallet.address && balance !== null && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Balance: {balance.toFixed(8)} OCT
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedWallet?.address === wallet.address && (
                            <>
                              <Check className="h-5 w-5 text-primary" />
                              {isLoadingBalance && (
                                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Balance Check */}
            {selectedWallet && balance !== null && (
              <div className="p-3 bg-muted rounded-md space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calculator className="h-4 w-4" />
                  Balance Check
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center">
                    <span>Current Balance:</span>
                    <span className="font-mono">{currentBalance.toFixed(8)} OCT</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>After Transaction:</span>
                    <span className={`font-mono ${currentBalance - totalCost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(currentBalance - totalCost).toFixed(8)} OCT
                    </span>
                  </div>
                  {totalCost > currentBalance && (
                    <div className="text-red-600 text-xs mt-2">
                      ⚠️ Insufficient balance for this transaction
                    </div>
                  )}
                </div>
              </div>
            )}

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Only approve transactions from websites you trust. This transaction cannot be reversed once confirmed.
              </AlertDescription>
            </Alert>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={isProcessing}
                className="flex-1"
              >
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={
                  isProcessing || 
                  !selectedWallet || 
                  balance === null || 
                  totalCost > currentBalance ||
                  isLoadingBalance ||
                  isResolvingAddress
                }
                className="flex-1"
              >
                {isProcessing ? "Sending..." : "Approve & Send"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}