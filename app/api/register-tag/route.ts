import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Inizializzazione client Supabase tramite HTTPS API
const supabase = createClient(
  'https://rvsgbsnkurutsburxkwk.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { uid, name, initial_balance } = await request.json();

    if (!uid) {
      return NextResponse.json({ success: false, error: "L'UID della carta è obbligatorio" }, { status: 400 });
    }

    // 1. Controlla se il tag esiste già
    const { data: existingTag } = await supabase
      .from('nfc_tags')
      .select('uid')
      .eq('uid', uid)
      .maybeSingle();

    if (existingTag) {
      return NextResponse.json({ success: false, error: "Questa tessera è già registrata!" }, { status: 400 });
    }

    const customerName = name || "Ospite Ombrellone";
    const balanceValue = parseFloat(parseFloat(initial_balance).toFixed(2)) || 0.00;

    // 2. Inserisci il Cliente nella tabella customers
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert([{ name: customerName, balance: balanceValue, is_active: true }])
      .select('id')
      .single();

    if (customerError) throw new Error(`Errore creazione cliente: ${customerError.message}`);
    const customerId = customer.id;

    // 3. Associa il tag NFC
    const { error: tagError } = await supabase
      .from('nfc_tags')
      .insert([{ uid: uid, customer_id: customerId, status: 'active' }]);

    if (tagError) throw new Error(`Errore associazione tag: ${tagError.message}`);

    // 4. Scrivi lo storico se c'è un saldo iniziale
    if (balanceValue > 0) {
      await supabase
        .from('transactions')
        .insert([{ customer_id: customerId, type: 'topup', amount: balanceValue, description: 'Carico Iniziale Cassa' }]);
    }

    return NextResponse.json({ success: true, message: "Tessera attivata con successo", customer_id: customerId });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
