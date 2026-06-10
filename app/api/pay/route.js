export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Incolla la tua chiave anonima dentro le virgolette vuote dopo il simbolo ||
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "INCOLLA_QUI_LA_TUA_CHIAVE_ANON_PUBLIC_DI_SUPABASE";

const supabase = createClient(
  'https://rvsgbsnkurutsburxkwk.supabase.co',
  SUPABASE_KEY
);

export async function POST(request) {
  try {
    const { uid, amount, description } = await request.json();
    const chargeAmount = parseFloat(amount);

    // 1. Validazione dati in ingresso
    if (!uid || isNaN(chargeAmount) || chargeAmount <= 0) {
      return NextResponse.json({ success: false, error: "Dati di pagamento non validi" }, { status: 400 });
    }

    // 2. Controllo se il braccialetto/tag esiste ed è attivo, recuperando il saldo del cliente relazionato
    const { data: tag, error: tagError } = await supabase
      .from('nfc_tags')
      .select('customer_id, customers(balance)')
      .eq('uid', uid)
      .eq('status', 'active')
      .maybeSingle();

    if (tagError || !tag) {
      return NextResponse.json({ success: false, error: "Braccialetto non valido o non attivo" }, { status: 404 });
    }

    const customerId = tag.customer_id;
    const currentBalance = parseFloat(tag.customers.balance) || 0.00;

    // 3. Controllo se l'utente ha abbastanza soldi
    if (currentBalance < chargeAmount) {
      return NextResponse.json({ success: false, error: "Credito insufficiente sull'eWallet!" }, { status: 400 });
    }

    // 4. Calcolo del nuovo saldo (arrotondato a 2 decimali per i centesimi)
    const newBalance = parseFloat((currentBalance - chargeAmount).toFixed(2));

    // 5. Aggiornamento del saldo sul database Supabase
    const { error: updateError } = await supabase
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', customerId);

    if (updateError) throw new Error("Errore durante l'addebito del saldo");

    // 6. Registrazione della transazione nello storico (purchase = acquisto)
    await supabase
      .from('transactions')
      .insert([
        { 
          customer_id: customerId, 
          type: 'purchase', 
          amount: chargeAmount, 
          description: description || 'Consumazione Bar Lido' 
        }
      ]);

    // 7. Risposta di successo al POS / Terminale
    return NextResponse.json({ 
      success: true, 
      message: "Pagamento completato con successo", 
      remaining_balance: newBalance 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
