'use client';

import { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function InstallForm() {
  const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>){
    event.preventDefault();setLoading(true);setError(null);
    const form=new FormData(event.currentTarget);
    if(form.get('password')!==form.get('confirmPassword')){setError('As senhas não coincidem.');setLoading(false);return;}
    const response=await fetch('/api/install',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});
    const result=await response.json() as {error?:string};
    if(!response.ok){setError(result.error??'Não foi possível instalar.');setLoading(false);return;}
    window.location.href='/dashboard';
  }
  return <main className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
    <Card className="w-full max-w-lg"><CardHeader className="text-center">
      <div className="bg-primary/10 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl"><Database className="text-primary h-6 w-6" /></div>
      <CardTitle>Instalação inicial</CardTitle><CardDescription>MySQL conectado. Crie a empresa e o primeiro administrador local.</CardDescription>
    </CardHeader><CardContent><form onSubmit={submit} className="space-y-4">
      {error&&<div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
      <div className="space-y-2"><Label htmlFor="accountName">Nome da empresa</Label><Input id="accountName" name="accountName" defaultValue="JP Massagem" required /></div>
      <div className="space-y-2"><Label htmlFor="fullName">Nome do administrador</Label><Input id="fullName" name="fullName" autoComplete="name" required /></div>
      <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
      <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar senha</Label><Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></div></div>
      <Button className="w-full" disabled={loading}>{loading&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{loading?'Configurando...':'Concluir instalação'}</Button>
    </form></CardContent></Card>
  </main>;
}
