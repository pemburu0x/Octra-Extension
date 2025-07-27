import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, AlertTriangle, Wallet as WalletIcon, CheckCircle, ExternalLink, Copy, Zap, Trash2 } from 'lucide-react';
import { Wallet } from '../types/wallet';
import { fetchBalance, sendTransaction, createTransaction } from '../utils/api';
import { validateRecipientInput, resolveRecipientAddress } from '../utils/ons';
import { useToast } from '@/hooks/use-toast';

interface FileRecipient {
  address: string;
  resolvedAddress?: string;
  amount: string;
  isValid: boolean;
  error?: string;
}

interface FileMultiSendProps {
  wallet: Wallet | null;
  balance: number | null;
  nonce: number;
  onBalanceUpdate: (balance: number) => void;
  onNonceUpdate: (nonce: number) => void;
  onTransactionSuccess: () => void;
}

export function FileMultiSend({ wallet, balance, nonce, onBalanceUpdate, onNonceUpdate, onTransactionSuccess }: FileMultiSendProps) {
  const [recipients, setRecipients] = useState<FileRecipient[]>([]);
  const [amountMode, setAmountMode] = useState<'same' | 'different'>('same');
  const [sameAmount, setSameAmount] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<Array<{ success: boolean; hash?: string; error?: string; recipient: string; amount: string }>>([]);
  const { toast } = useToast();

  const calculateFee = (amount: number) => {
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

  const parseFileContent = async (content: string): Promise<FileRecipient[]> => {
    const lines = content.split('\n').filter(line => line.trim());
    const parsedRecipients: FileRecipient[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      let address = '';
      let amount = '';
      let error = '';
      let isValid = false;
      let resolvedAddress = '';

      if (amountMode === 'different') {
        // Format: address,amount atau address amount
        const parts = trimmedLine.split(/[,\s]+/);
        if (parts.length >= 2) {
          address = parts[0];
          amount = parts[1];
        } else {
          address = parts[0];
          error = 'Amount missing for different amount mode';
        }
      } else {
        // Format: address only
        address = trimmedLine;
        amount = sameAmount;
      }

      // Validate and resolve address
      const validation = validateRecipientInput(address);
      if (validation.isValid) {
        if (validation.type === 'address') {
          resolvedAddress = address;
          isValid = true;
        } else if (validation.type === 'ons') {
          try {
            const resolution = await resolveRecipientAddress(address);
            if (resolution.address) {
              resolvedAddress = resolution.address;
              isValid = true;
            } else {
              error = resolution.error || 'Failed to resolve ONS domain';
              isValid = false;
            }
          } catch (resolveError) {
            error = 'Failed to resolve ONS domain';
            isValid = false;
          }
        }
        
        if (!error) {
          if (amountMode === 'same') {
            // isValid already set above
          } else {
            isValid = !!amount && !isNaN(Number(amount)) && Number(amount) > 0;
          }
        } else {
          isValid = false;
        }
      } else {
        error = validation.error || 'Invalid address format';
        isValid = false;
      }

      // Additional validation for different amount mode
      if (amountMode === 'different' && (!amount || isNaN(Number(amount)) || Number(amount) <= 0)) {
        error = 'Invalid amount';
        isValid = false;
      }

      parsedRecipients.push({
        address,
        resolvedAddress,
        amount,
        isValid,
        error
      });
    }

    return parsedRecipients;
  };


  const processFile = async (file: File) => {
    if (!file.name.endsWith('.txt')) {
      toast({
        title: "Invalid File",
        description: "Please upload a .txt file",
        variant: "destructive",
      });
      return;
    }

    if (amountMode === 'same' && (!sameAmount || isNaN(Number(sameAmount)) || Number(sameAmount) <= 0)) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount for same amount mode",
        variant: "destructive",
      });
      clearRecipients();
      return;
    }

    setIsProcessing(true);
    try {
      const content = await file.text();
      const parsedRecipients = await parseFileContent(content);
      
      if (parsedRecipients.length === 0) {
        toast({
          title: "Empty File",
          description: "No valid addresses found in the file",
          variant: "destructive",
        });
        return;
      }

      setRecipients(parsedRecipients);

      const validCount = parsedRecipients.filter(r => r.isValid).length;
      const invalidCount = parsedRecipients.length - validCount;

      toast({
        title: "File Processed",
        description: `Found ${validCount} valid addresses${invalidCount > 0 ? ` and ${invalidCount} invalid entries` : ''}`,
      });
    } catch (error) {
      toast({
        title: "File Processing Error",
        description: "Failed to process the file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const file = event.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, [amountMode, sameAmount]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleSend = async () => {
    if (!wallet) {
      toast({
        title: "Error",
        description: "No wallet connected",
        variant: "destructive",
      });
      return;
    }

    const validRecipients = recipients.filter(r => r.isValid);
    if (validRecipients.length === 0) {
      toast({
        title: "Error",
        description: "No valid recipients found",
        variant: "destructive",
      });
      return;
    }

    const totalAmount = validRecipients.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalFees = validRecipients.reduce((sum, r) => sum + calculateFee(Number(r.amount)), 0);
    const totalCost = totalAmount + totalFees;

    if (balance !== null && totalCost > balance) {
      toast({
        title: "Error",
        description: `Insufficient balance. Need ${totalCost.toFixed(8)} OCT (${totalAmount.toFixed(8)} + ${totalFees.toFixed(8)} fees)`,
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    setResults([]);

    try {
      // Refresh nonce before sending
      const freshBalanceData = await fetchBalance(wallet.address);
      let currentNonce = freshBalanceData.nonce;

      const transactionResults: Array<{ success: boolean; hash?: string; error?: string; recipient: string; amount: string }> = [];

      // Send transactions in batches (batch_size = 5)
      const batchSize = 5;
      const batches = [];
      for (let i = 0; i < validRecipients.length; i += batchSize) {
        batches.push(validRecipients.slice(i, i + batchSize));
      }

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const batchPromises = [];

        // Prepare all transactions in the batch
        for (let i = 0; i < batch.length; i++) {
          const recipient = batch[i];
          const finalRecipientAddress = recipient.resolvedAddress!;
          const txIndex = batchIdx * batchSize + i;
          const transactionNonce = currentNonce + 1 + txIndex;

          const transaction = createTransaction(
            wallet.address,
            finalRecipientAddress,
            Number(recipient.amount),
            transactionNonce,
            wallet.privateKey,
            wallet.publicKey || ''
            // No message for lightning multi send
          );

          batchPromises.push(
            sendTransaction(transaction).then(result => ({
              ...result,
              recipient: recipient.address,
              amount: recipient.amount
            }))
          );
        }

        // Send batch concurrently
        const batchResults = await Promise.allSettled(batchPromises);

        // Process batch results
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const recipient = batch[i];
          
          if (result.status === 'fulfilled') {
            transactionResults.push(result.value);
          } else {
            transactionResults.push({
              success: false,
              error: result.reason?.message || 'Unknown error',
              recipient: recipient.address,
              amount: recipient.amount
            });
          }
        }

        // Small delay between batches
        if (batchIdx < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      setResults(transactionResults);

      const successCount = transactionResults.filter(r => r.success).length;
      if (successCount > 0) {
        toast({
          title: "Lightning Multi Send Completed!",
          description: `${successCount} out of ${transactionResults.length} transactions sent successfully`,
        });

        // Reset form if all successful
        if (successCount === transactionResults.length) {
          setRecipients([]);
          setSameAmount('');
        }

        // Update nonce based on successful transactions
        const newNonce = currentNonce + successCount;
        onNonceUpdate(newNonce);

        // Update balance after successful transactions
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
      }
    } catch (error) {
      console.error('File multi-send error:', error);
      toast({
        title: "Error",
        description: "Send failed",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const clearRecipients = () => {
    setRecipients([]);
    setResults([]);
    // Reset file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
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

  const validRecipients = recipients.filter(r => r.isValid);
  const totalAmount = validRecipients.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalFees = validRecipients.reduce((sum, r) => sum + calculateFee(Number(r.amount || 0)), 0);
  const totalCost = totalAmount + totalFees;
  const currentBalance = balance || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Lightning Multi Send
          <Badge variant="secondary" className="text-xs">File Upload</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <div className="flex items-start space-x-3">
            <Zap className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <AlertDescription>
              Upload a .txt file with addresses to send OCT quickly. Lightning fast with no messages for maximum speed.
            </AlertDescription>
          </div>
        </Alert>

        {/* Amount Mode Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Amount Mode</Label>
          <RadioGroup value={amountMode} onValueChange={(value: 'same' | 'different') => setAmountMode(value)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="same" id="same" />
              <Label htmlFor="same">Same amount for all addresses</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="different" id="different" />
              <Label htmlFor="different">Different amount for each address</Label>
            </div>
          </RadioGroup>

          {amountMode === 'same' && (
            <div className="space-y-2">
              <Label htmlFor="same-amount">Amount per Address (OCT)</Label>
              <Input
                id="same-amount"
                type="number"
                placeholder="0.00000000"
                value={sameAmount}
                onChange={(e) => setSameAmount(e.target.value)}
                step="0.1"
                min="0"
              />
            </div>
          )}
        </div>

        {/* File Format Instructions */}
        <div className="p-3 bg-muted rounded-md">
          <div className="text-sm font-medium mb-2">File Format (.txt)</div>
          <div className="text-xs text-muted-foreground space-y-1">
            {amountMode === 'same' ? (
              <>
                <div>• One address or ONS domain per line</div>
                <div>• Example:</div>
                <div className="font-mono bg-background p-2 rounded mt-1">
                  oct1234567890abcdef1234567890abcdef12345678<br/>
                  alice.oct
                </div>
              </>
            ) : (
              <>
                <div>• Format: address,amount or address amount</div>
                <div>• One entry per line</div>
                <div>• Support .oct domain</div>
                <div>• Example:</div>
                <div className="font-mono bg-background p-2 rounded mt-1">
                  oct1234567890abcdef1234567890abcdef12345678,1.5<br/>
                  bob.oct,0.5<br/>
                  oct1234567890abcdef1234567890abcdef12345678 1.5<br/>
                  foo.oct 0.3
                </div>
              </>
            )}
          </div>
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="space-y-4">
            <div className="flex justify-center">
              <Upload className="h-12 w-12 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium">Drop .txt file containing your octra address here</p>
              <p className="text-sm text-muted-foreground">Supports Octra addresses and ONS domains</p>
            </div>
            <div>
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isProcessing}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={isProcessing}
              >
                <FileText className="h-4 w-4 mr-2" />
                {isProcessing ? 'Processing...' : 'Choose File'}
              </Button>
            </div>
          </div>
        </div>

        {/* Recipients List */}
        {recipients.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">
                Recipients ({validRecipients.length} valid, {recipients.length - validRecipients.length} invalid)
              </Label>
              <Button variant="ghost" size="sm" onClick={clearRecipients}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
            <ScrollArea className="max-h-[calc(90vh-100px)] pr-2">
              <div className="pr-2">
                <div className="max-h-60 space-y-2">
                  {recipients.map((recipient, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        recipient.isValid ? 'border-green-200 bg-green-50 dark:bg-green-950/50' : 'border-red-200 bg-red-50 dark:bg-red-950/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {recipient.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-mono text-sm truncate">{recipient.address}</span>
                          </div>
                          {recipient.resolvedAddress && recipient.resolvedAddress !== recipient.address && (
                            <div className="text-xs text-muted-foreground mt-1 font-mono">
                              → {recipient.resolvedAddress}
                            </div>
                          )}
                          {recipient.error && (
                            <div className="text-xs text-red-600 mt-1">{recipient.error}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-medium">
                            {recipient.amount} OCT
                          </div>
                          {recipient.isValid && (
                            <div className="text-xs text-muted-foreground">
                              Fee: {calculateFee(Number(recipient.amount)).toFixed(3)} OCT
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>

          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Transaction Results</Label>
              <Button variant="ghost" size="sm" onClick={() => setResults([])}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Logs
              </Button>
            </div>
            {results.map((result, index) => (
              <div
                key={index}
                className={`rounded-lg p-3 sm:p-4 ${result.success ? 'bg-green-50 border border-green-200 dark:bg-green-950/50 dark:border-green-800' : 'bg-red-50 border border-red-200 dark:bg-red-950/50 dark:border-red-800'}`}
              >
                <div className="flex items-start space-x-2">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium break-words ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {result.success ? 'Success' : 'Failed'}
                    </p>
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">To:</span> <span className="font-mono break-all">{result.recipient}</span>
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Amount:</span> {result.amount} OCT
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Fee:</span> {calculateFee(Number(result.amount) || 0).toFixed(3)} OCT
                      </p>
                    </div>
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
                      <p className="text-red-700 dark:text-red-300 text-xs mt-1 break-words">{result.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {validRecipients.length > 0 && (
          <>
            <Separator />
            <div className="p-3 sm:p-4 bg-muted rounded-md space-y-2">
              <div className="text-sm font-medium mb-2">Transaction Summary</div>
              <div className="space-y-1 text-xs sm:text-sm">
                <div className="flex justify-between items-center">
                  <span>Valid Recipients:</span>
                  <span>{validRecipients.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Total Amount:</span>
                  <span className="font-mono">{totalAmount.toFixed(8)} OCT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Total Fees:</span>
                  <span className="font-mono">{totalFees.toFixed(8)} OCT</span>
                </div>
                <div className="flex justify-between items-center font-medium">
                  <span>Total Cost:</span>
                  <span className="font-mono">{totalCost.toFixed(8)} OCT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Current Balance:</span>
                  <span className="font-mono">{currentBalance.toFixed(8)} OCT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Remaining Balance:</span>
                  <span className={`font-mono ${currentBalance - totalCost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(currentBalance - totalCost).toFixed(8)} OCT
                  </span>
                </div>
                {totalCost > currentBalance && (
                  <div className="text-red-600 text-xs mt-2 break-words">
                    ⚠️ Insufficient balance for this transaction
                  </div>
                )}
              </div>
            </div>

            <Button 
              onClick={handleSend}
              disabled={isSending || validRecipients.length === 0 || totalCost > currentBalance}
              className="w-full text-sm sm:text-base"
              size="lg"
            >
              {isSending ? "Sending..." : `⚡ Send to ${validRecipients.length} Recipients`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}