import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { uid, amount } = await request.json();
    const topupAmount = parseFloat(amount);

    if (!uid || isNaN(topupAmount) || topupAmount <= 0) {
      return NextResponse.json({ success: false, error: "Dati non validi" }, { status: 400 });
    }

    // 1. Cerchiamo il tag NFC tramite API HTTPS
    const { data: tag, error: tagError } = await supabase
      .from('nfc_tags')
      .select('customer_id')
      .eq('uid', uid)
      .eq('status', 'active')
      .single();

    if (tagError || !tag) throw new Error("Tessera non trovata o non attiva");

    // 2. Recuperiamo il saldo del cliente
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('balance')
      .eq('id', tag.customer_id)
      .single();

    if (custError || !customer) throw new Error("Cliente non trovato");

    const currentBalance = parseFloat(customer.balance) || 0;
    const newBalance = parseFloat((currentBalance + topupAmount).toFixed(2));

    // 3. Aggiorniamo il saldo
    const { error: updateError } = await supabase
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', tag.customer_id);

    if (updateError) throw new Error("Impossibile aggiornare il saldo");

    // 4. Inseriamo la transazione nello storico (opzionale)
    await supabase
      .from('transactions')
      .insert([
        { customer_id: tag.customer_id, type: 'topup', amount: topupAmount, description: 'Ricarica Cassa Vercel' }
      ]);

    return NextResponse.json({ success: true, new_balance: newBalance });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
