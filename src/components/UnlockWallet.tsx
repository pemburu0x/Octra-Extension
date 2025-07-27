import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { verifyPassword, decryptWalletData } from '../utils/password';
import { Wallet } from '../types/wallet';
import { useToast } from '@/hooks/use-toast';

interface UnlockWalletProps {
  onUnlock: (wallets: Wallet[]) => void;
}

export function UnlockWallet({ onUnlock }: UnlockWalletProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { toast } = useToast();

  const handleUnlock = async () => {
    if (!password) {
      toast({
        title: "Password Required",
        description: "Please enter your password",
        variant: "destructive",
      });
      return;
    }

    setIsUnlocking(true);

    try {
      const hashedPassword = localStorage.getItem('walletPasswordHash');
      const salt = localStorage.getItem('walletPasswordSalt');
      
      if (!hashedPassword || !salt) {
        throw new Error('No password set');
      }

      // Verify password
      const isValid = await verifyPassword(password, hashedPassword, salt);
      
      if (!isValid) {
        toast({
          title: "Invalid Password",
          description: "The password you entered is incorrect",
          variant: "destructive",
        });
        return;
      }

      // Decrypt wallets
      const encryptedWallets = JSON.parse(localStorage.getItem('encryptedWallets') || '[]');
      const decryptedWallets: Wallet[] = [];

      for (const encryptedWallet of encryptedWallets) {
        try {
          let wallet;
          try {
            const decryptedData = await decryptWalletData(encryptedWallet.encryptedData, password);
            wallet = JSON.parse(decryptedData);
          } catch (decryptError) {
            // If decryption fails, try to parse as plain JSON (temporary wallets)
            console.warn('Decryption failed, trying plain JSON:', encryptedWallet.address);
            wallet = JSON.parse(encryptedWallet.encryptedData);
          }
          decryptedWallets.push(wallet);
        } catch (error) {
          console.error('Failed to decrypt wallet:', encryptedWallet.address, error);
        }
      }
      
      // Also check regular localStorage for any wallets that might not be encrypted yet
      const regularWallets = JSON.parse(localStorage.getItem('wallets') || '[]');
      for (const regularWallet of regularWallets) {
        const alreadyExists = decryptedWallets.some(w => w.address === regularWallet.address);
        if (!alreadyExists) {
          decryptedWallets.push(regularWallet);
        }
      }

      // Mark wallet as unlocked
      localStorage.setItem('isWalletLocked', 'false');
      localStorage.setItem('wallets', JSON.stringify(decryptedWallets));
      
      // Set active wallet if not already set
      const activeWalletId = localStorage.getItem('activeWalletId');
      if (!activeWalletId && decryptedWallets.length > 0) {
        localStorage.setItem('activeWalletId', decryptedWallets[0].address);
      }
      
      // Trigger storage events for cross-tab synchronization
      // Use setTimeout to ensure localStorage is fully updated before dispatching events
      setTimeout(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'wallets',
          oldValue: null,
          newValue: JSON.stringify(decryptedWallets),
          storageArea: localStorage
        }));
        
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'isWalletLocked',
          oldValue: 'true',
          newValue: 'false',
          storageArea: localStorage
        }));
      }, 50);
      
      toast({
        title: "Wallet Unlocked!",
        description: "Welcome back to your wallet",
      });

      onUnlock(decryptedWallets);
    } catch (error) {
      console.error('Unlock error:', error);
      toast({
        title: "Unlock Failed",
        description: "Failed to unlock wallet",
        variant: "destructive",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary rounded-full">
                <Shield className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Unlock Your Wallet</CardTitle>
            <p className="text-muted-foreground">
              Enter your password to access your wallet
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pr-10"
                  disabled={isUnlocking}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isUnlocking}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              onClick={handleUnlock}
              disabled={isUnlocking || !password}
              className="w-full"
              size="lg"
            >
              {isUnlocking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unlocking...
                </>
              ) : (
                "Unlock Wallet"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}