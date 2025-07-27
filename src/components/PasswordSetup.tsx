import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Wallet } from '../types/wallet';
import { hashPassword, encryptWalletData } from '../utils/password';
import { useToast } from '@/hooks/use-toast';

interface PasswordSetupProps {
  wallet: Wallet;
  onPasswordSet: (wallet: Wallet) => void;
  onBack: () => void;
}

export function PasswordSetup({ wallet, onPasswordSet, onBack }: PasswordSetupProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acknowledgeRecovery, setAcknowledgeRecovery] = useState(false);
  const [acknowledgeBrowser, setAcknowledgeBrowser] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const validatePassword = () => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  const handleCreatePassword = async () => {
    const validationError = validatePassword();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    if (!acknowledgeRecovery || !acknowledgeBrowser) {
      toast({
        title: "Acknowledgment Required",
        description: "Please acknowledge both security warnings",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      // Hash the password
      const { hashedPassword, salt } = await hashPassword(password);
      
      // Encrypt wallet data
      const walletData = JSON.stringify(wallet);
      const encryptedWalletData = await encryptWalletData(walletData, password);
      
      // Store password hash and encrypted wallet
      localStorage.setItem('walletPasswordHash', hashedPassword);
      localStorage.setItem('walletPasswordSalt', salt);
      localStorage.setItem('isWalletLocked', 'false');
      
      // Store encrypted wallet data
      const existingWallets = JSON.parse(localStorage.getItem('encryptedWallets') || '[]');
      const updatedWallets = [...existingWallets, {
        address: wallet.address,
        encryptedData: encryptedWalletData,
        createdAt: Date.now()
      }];
      localStorage.setItem('encryptedWallets', JSON.stringify(updatedWallets));
      
      toast({
        title: "Password Created!",
        description: "Your wallet is now protected with a password",
      });
      
      onPasswordSet(wallet);
    } catch (error) {
      console.error('Password creation error:', error);
      toast({
        title: "Error",
        description: "Failed to create password protection",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const passwordError = validatePassword();

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Secure Your Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Create a password to protect your wallet. This password will be required when dApps request to connect to your wallet.
            </AlertDescription>
          </Alert>

          {/* Password Field */}
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
          </div>

          {/* Acknowledgments */}
          <div className="space-y-4">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="acknowledge-recovery"
                checked={acknowledgeRecovery}
                onCheckedChange={(checked) => setAcknowledgeRecovery(checked as boolean)}
              />
              <Label htmlFor="acknowledge-recovery" className="text-sm leading-5">
                I acknowledge that this password can not be used to recover my accounts, I still need to preserve the recovery methods used when first creating my accounts (seed phrase etc.)
              </Label>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="acknowledge-browser"
                checked={acknowledgeBrowser}
                onCheckedChange={(checked) => setAcknowledgeBrowser(checked as boolean)}
              />
              <Label htmlFor="acknowledge-browser" className="text-sm leading-5">
                I acknowledge that storing this password in my browser's password manager exposes me to additional risk (we recommend you do not).
              </Label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onBack}
              disabled={isCreating}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleCreatePassword}
              disabled={isCreating || !password || !confirmPassword || !acknowledgeRecovery || !acknowledgeBrowser || !!passwordError}
              className="flex-1"
            >
              {isCreating ? "Creating..." : "Next"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}