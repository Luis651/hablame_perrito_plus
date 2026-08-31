import { Firestore, Timestamp } from '@google-cloud/firestore';

const db = new Firestore({
  projectId: 'studio-9723642507-b8a78',
  keyFilename: './service-account.json'
});

async function clearCollection(collectionName: string) {
  const snapshot = await db.collection(collectionName).get();
  const batchSize = 100;
  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + batchSize).forEach(doc => {
      // Don't delete primary admin user if in users collection
      if (collectionName === 'users' && doc.data().email === 'luisdanielalejandroramirez@gmail.com') {
        return;
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
}

async function clearSubcollection(parentPath: string, subcollectionName: string) {
  const parentSnap = await db.collection(parentPath).get();
  for (const parentDoc of parentSnap.docs) {
    const subSnap = await parentDoc.ref.collection(subcollectionName).get();
    const batch = db.batch();
    subSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seed() {
  console.log('🚀 Iniciando limpieza y generación de datos realistas...');

  // 1. Limpieza de colecciones
  console.log('🧹 Limpiando datos antiguos...');
  await clearCollection('waste_logs');
  await clearCollection('transfers');
  await clearCollection('production_logs');
  await clearCollection('products');
  await clearCollection('ingredients');
  await clearCollection('preparados');

  for (const locId of ['br-1', 'br-2', 'wh-1']) {
    await clearSubcollection(`locations/${locId}/orders`, 'payments');
    await clearSubcollection(`locations/${locId}/orders`, 'items');
    await clearCollection(`locations/${locId}/orders`);
    await clearCollection(`locations/${locId}/inventory`);
    await clearCollection(`locations/${locId}/preparados_inventory`);
  }

  console.log('✅ Limpieza completada.');

  // 2. Configuración Cambiaria
  console.log('💵 Configurando tasa cambiaria oficial...');
  await db.doc('config/exchangeRate').set({
    exchangeRate: 791.67,
    currencySymbol: 'USD',
    currencyName: 'Dólar BCV Oficial',
    rateSource: 'BCV_USD',
    lastUpdated: Timestamp.now()
  });

  // 3. Usuarios y Roles
  console.log('👥 Creando usuarios operativos...');
  const users = [
    {
      id: 'admin-luis',
      email: 'luisdanielalejandroramirez@gmail.com',
      firstName: 'Luis',
      lastName: 'Ramírez',
      role: 'ADMIN',
      locationId: 'br-1'
    },
    {
      id: 'usr-cajero-mariana',
      email: 'cajero.cima@hablameperrito.com',
      firstName: 'Mariana',
      lastName: 'Gómez',
      role: 'CASHIER',
      locationId: 'br-1'
    },
    {
      id: 'usr-mesero-carlos',
      email: 'mesero.carlos@hablameperrito.com',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      role: 'WAITER',
      locationId: 'br-1'
    },
    {
      id: 'usr-mesero-ana',
      email: 'mesero.ana@hablameperrito.com',
      firstName: 'Ana',
      lastName: 'Rivas',
      role: 'WAITER',
      locationId: 'br-1'
    },
    {
      id: 'usr-mesero-pedro',
      email: 'mesero.pedro@hablameperrito.com',
      firstName: 'Pedro',
      lastName: 'Sánchez',
      role: 'WAITER',
      locationId: 'br-2'
    }
  ];

  for (const u of users) {
    // Si ya existe un documento con ese email, conservamos el ID real de Auth
    const existingSnap = await db.collection('users').where('email', '==', u.email).get();
    if (!existingSnap.empty) {
      await existingSnap.docs[0].ref.set(u, { merge: true });
    } else {
      await db.doc(`users/${u.id}`).set(u);
    }
  }

  // 4. Insumos Base e Inventario
  console.log('📦 Creando catálogo de insumos e inventario multi-sede...');
  const ingredients = [
    { id: 'ing-pan', name: 'Pan para Perro', unit: 'paquetes', category: 'Panadería', costUSD: 1.80 },
    { id: 'ing-salchicha', name: 'Salchicha Premium', unit: 'paquetes', category: 'Embutidos', costUSD: 3.20 },
    { id: 'ing-papas', name: 'Papas Ralladas Crujientes', unit: 'paquetes', category: 'Snacks', costUSD: 2.10 },
    { id: 'ing-queso', name: 'Queso Blanco Rallado', unit: 'kg', category: 'Lácteos', costUSD: 4.50 },
    { id: 'ing-carne-bruto', name: 'Carne Molida Especial', unit: 'kg', category: 'Carnes', costUSD: 5.80 },
    { id: 'ing-especias', name: 'Mix de Especias de la Casa', unit: 'kg', category: 'Condimentos', costUSD: 3.00 },
    { id: 'ing-salsas-base', name: 'Salsa Especial Base', unit: 'litros', category: 'Salsas', costUSD: 2.50 },
    { id: 'ing-tocineta', name: 'Tocineta Ahumada', unit: 'kg', category: 'Embutidos', costUSD: 7.50 },
    { id: 'ing-cebolla', name: 'Cebolla Picada Fresca', unit: 'kg', category: 'Vegetales', costUSD: 1.20 },
    { id: 'ing-refresco', name: 'Refresco 355ml (Lata)', unit: 'latas', category: 'Bebidas', costUSD: 0.75 },
    { id: 'ing-cerveza', name: 'Cerveza Nacional 250ml', unit: 'botellas', category: 'Bebidas', costUSD: 0.90 }
  ];

  for (const ing of ingredients) {
    await db.doc(`ingredients/${ing.id}`).set({ ...ing, createdAt: Timestamp.now() });

    // Stock en Depósito Central (wh-1)
    await db.doc(`locations/wh-1/inventory/${ing.id}`).set({
      id: ing.id,
      ingredientId: ing.id,
      locationId: 'wh-1',
      quantity: 150,
      lastUpdatedAt: Timestamp.now()
    });

    // Stock en Sucursal CIMA (br-1) - Con algunos niveles bajos para alertas
    let br1Qty = 45;
    if (ing.id === 'ing-papas') br1Qty = 8; // CRÍTICO
    if (ing.id === 'ing-tocineta') br1Qty = 14; // BAJO
    if (ing.id === 'ing-pan') br1Qty = 60;

    await db.doc(`locations/br-1/inventory/${ing.id}`).set({
      id: ing.id,
      ingredientId: ing.id,
      locationId: 'br-1',
      quantity: br1Qty,
      lastUpdatedAt: Timestamp.now()
    });

    // Stock en Sucursal TRAGO SPREXX (br-2)
    let br2Qty = 35;
    if (ing.id === 'ing-salchicha') br2Qty = 6; // CRÍTICO
    await db.doc(`locations/br-2/inventory/${ing.id}`).set({
      id: ing.id,
      ingredientId: ing.id,
      locationId: 'br-2',
      quantity: br2Qty,
      lastUpdatedAt: Timestamp.now()
    });
  }

  // 5. Preparados / Sub-insumos
  console.log('🥣 Creando sub-insumos y recetas de producción...');
  const preparados = [
    {
      id: 'prep-carne-preparada',
      name: 'Carne Molida Preparada (Cocida)',
      outputUnit: 'kg',
      category: 'Preparados',
      recipe: [
        { ingredientId: 'ing-carne-bruto', ingredientName: 'Carne Molida Especial', quantity: 1.0 },
        { ingredientId: 'ing-especias', ingredientName: 'Mix de Especias de la Casa', quantity: 0.1 },
        { ingredientId: 'ing-cebolla', ingredientName: 'Cebolla Picada Fresca', quantity: 0.15 }
      ]
    },
    {
      id: 'prep-salsa-casa',
      name: 'Salsa Tártara Perrito Plus',
      outputUnit: 'litros',
      category: 'Salsas',
      recipe: [
        { ingredientId: 'ing-salsas-base', ingredientName: 'Salsa Especial Base', quantity: 0.8 },
        { ingredientId: 'ing-especias', ingredientName: 'Mix de Especias de la Casa', quantity: 0.05 },
        { ingredientId: 'ing-cebolla', ingredientName: 'Cebolla Picada Fresca', quantity: 0.1 }
      ]
    }
  ];

  for (const prep of preparados) {
    await db.doc(`preparados/${prep.id}`).set({ ...prep, createdAt: Timestamp.now() });

    await db.doc(`locations/br-1/preparados_inventory/${prep.id}`).set({
      id: prep.id,
      locationId: 'br-1',
      quantity: 12.5,
      lastUpdatedAt: Timestamp.now()
    });

    await db.doc(`locations/br-2/preparados_inventory/${prep.id}`).set({
      id: prep.id,
      locationId: 'br-2',
      quantity: 8.0,
      lastUpdatedAt: Timestamp.now()
    });
  }

  // 6. Catálogo de Productos y Combos
  console.log('🍔 Creando menú de productos y combos...');
  const products = [
    {
      id: 'prod-perro-especial',
      name: 'Perro Caliente Especial',
      description: 'Salchicha premium, papas crujientes, queso blanco y salsa tártara.',
      masterPriceUSD: 3.50,
      sku: 'PR-ESP',
      isCombo: false,
      recipe: [
        { ingredientId: 'ing-pan', ingredientName: 'Pan para Perro', quantity: 0.1 },
        { ingredientId: 'ing-salchicha', ingredientName: 'Salchicha Premium', quantity: 0.1 },
        { ingredientId: 'ing-papas', ingredientName: 'Papas Ralladas Crujientes', quantity: 0.05 },
        { ingredientId: 'ing-queso', ingredientName: 'Queso Blanco Rallado', quantity: 0.04 }
      ]
    },
    {
      id: 'prod-perro-mega-queso',
      name: 'Perro Caliente Mega Queso & Tocineta',
      description: 'Con doble ración de queso fundido y tocineta crujiente.',
      masterPriceUSD: 4.50,
      sku: 'PR-MQ',
      isCombo: false,
      recipe: [
        { ingredientId: 'ing-pan', ingredientName: 'Pan para Perro', quantity: 0.1 },
        { ingredientId: 'ing-salchicha', ingredientName: 'Salchicha Premium', quantity: 0.1 },
        { ingredientId: 'ing-queso', ingredientName: 'Queso Blanco Rallado', quantity: 0.08 },
        { ingredientId: 'ing-tocineta', ingredientName: 'Tocineta Ahumada', quantity: 0.05 }
      ]
    },
    {
      id: 'prod-hamburguesa-clasica',
      name: 'Hamburguesa Especial de la Casa',
      description: 'Carne sazonada, queso blanco, tocineta y salsas.',
      masterPriceUSD: 6.00,
      sku: 'HB-ESP',
      isCombo: false,
      recipe: [
        { ingredientId: 'ing-pan', ingredientName: 'Pan para Perro', quantity: 0.15 },
        { ingredientId: 'ing-carne-bruto', ingredientName: 'Carne Molida Especial', quantity: 0.18 },
        { ingredientId: 'ing-queso', ingredientName: 'Queso Blanco Rallado', quantity: 0.06 },
        { ingredientId: 'ing-tocineta', ingredientName: 'Tocineta Ahumada', quantity: 0.04 }
      ]
    },
    {
      id: 'prod-refresco-lata',
      name: 'Refresco en Lata 355ml',
      description: 'Coca-Cola, Pepsi o Chinotto bien frío.',
      masterPriceUSD: 1.50,
      sku: 'BEB-REF',
      isCombo: false,
      recipe: [
        { ingredientId: 'ing-refresco', ingredientName: 'Refresco 355ml (Lata)', quantity: 1 }
      ]
    },
    {
      id: 'prod-cerveza',
      name: 'Cerveza Zulia / Polar',
      description: 'Botella de 250ml retornable bien fría.',
      masterPriceUSD: 2.00,
      sku: 'BEB-CERV',
      isCombo: false,
      recipe: [
        { ingredientId: 'ing-cerveza', ingredientName: 'Cerveza Nacional 250ml', quantity: 1 }
      ]
    },
    // Combo
    {
      id: 'combo-duo-perrito',
      name: 'Combo Dúo Perrito (2 Perros + 2 Refrescos)',
      description: 'La combinación favorita para compartir.',
      masterPriceUSD: 8.50,
      sku: 'CMB-DUO',
      isCombo: true,
      comboItems: [
        { productId: 'prod-perro-especial', productName: 'Perro Caliente Especial', quantity: 2 },
        { productId: 'prod-refresco-lata', productName: 'Refresco en Lata 355ml', quantity: 2 }
      ],
      recipe: []
    }
  ];

  for (const prod of products) {
    await db.doc(`products/${prod.id}`).set({ ...prod, createdAt: Timestamp.now() });
  }

  // 7. Comandas Realistas y Flujo de Cobros
  console.log('📋 Generando comandas interactivas para meseros y cajero...');

  const now = new Date();
  const todayTS = Timestamp.fromDate(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayTS = Timestamp.fromDate(yesterday);

  const aug10 = new Date('2026-08-10T14:30:00');
  const aug10TS = Timestamp.fromDate(aug10);

  interface DemoOrder {
    id: string;
    locationId: string;
    customerName: string;
    tableNumber: string;
    waiterId: string;
    waiterName: string;
    status: 'OPEN' | 'PAID';
    totalUSD: number;
    totalPaidUSD: number;
    pendingBalanceUSD: number;
    date: Timestamp;
    items: any[];
    payments: any[];
  }

  const demoOrders: DemoOrder[] = [
    // ORDEN 1: HOY - Mesa 1 - Pagada Total (Carlos)
    {
      id: 'ORD-7001',
      locationId: 'br-1',
      customerName: 'Roberto Mendoza',
      tableNumber: 'Mesa 1',
      waiterId: 'usr-mesero-carlos',
      waiterName: 'Carlos Mendoza',
      status: 'PAID',
      totalUSD: 8.50,
      totalPaidUSD: 8.50,
      pendingBalanceUSD: 0.00,
      date: todayTS,
      items: [
        { id: 'it-1', productId: 'combo-duo-perrito', productName: 'Combo Dúo Perrito', quantity: 1, unitPriceUSD: 8.50, subtotalUSD: 8.50 }
      ],
      payments: [
        {
          id: 'pay-1',
          amountUSD: 8.50,
          amountBS: 6729.20,
          exchangeRateAtPayment: 791.67,
          paymentMethod: 'PAGO_MOVIL',
          paymentDate: todayTS,
          notes: 'Pago Móvil Banesco ref 4482'
        }
      ]
    },

    // ORDEN 2: HOY - Mesa 4 - ABONO PARCIAL con DEUDA ACTIVA (Ana) -> Ideal para mostrar el cobro
    {
      id: 'ORD-7002',
      locationId: 'br-1',
      customerName: 'Dr. Alejandro Peña',
      tableNumber: 'Mesa 4',
      waiterId: 'usr-mesero-ana',
      waiterName: 'Ana Rivas',
      status: 'OPEN',
      totalUSD: 25.26,
      totalPaidUSD: 10.00,
      pendingBalanceUSD: 15.26,
      date: todayTS,
      items: [
        { id: 'it-1', productId: 'prod-hamburguesa-clasica', productName: 'Hamburguesa Especial', quantity: 2, unitPriceUSD: 6.00, subtotalUSD: 12.00 },
        { id: 'it-2', productId: 'prod-perro-mega-queso', productName: 'Perro Caliente Mega Queso', quantity: 2, unitPriceUSD: 4.50, subtotalUSD: 9.00 },
        { id: 'it-3', productId: 'prod-cerveza', productName: 'Cerveza Zulia', quantity: 2, unitPriceUSD: 2.00, subtotalUSD: 4.00 },
        { id: 'it-4', productId: 'prod-refresco-lata', productName: 'Refresco en Lata', quantity: 1, unitPriceUSD: 1.50, subtotalUSD: 1.50 }
      ],
      payments: [
        {
          id: 'pay-1',
          amountUSD: 10.00,
          amountBS: 7916.70,
          exchangeRateAtPayment: 791.67,
          paymentMethod: 'DIVISAS',
          paymentDate: todayTS,
          notes: 'Billete de $10 USD entregado en caja'
        }
      ]
    },

    // ORDEN 3: HOY - Mesa 2 - ABIERTA RECIÉN CREADA (Carlos)
    {
      id: 'ORD-7003',
      locationId: 'br-1',
      customerName: 'Familia Morales',
      tableNumber: 'Mesa 2',
      waiterId: 'usr-mesero-carlos',
      waiterName: 'Carlos Mendoza',
      status: 'OPEN',
      totalUSD: 15.50,
      totalPaidUSD: 0.00,
      pendingBalanceUSD: 15.50,
      date: todayTS,
      items: [
        { id: 'it-1', productId: 'prod-perro-especial', productName: 'Perro Caliente Especial', quantity: 3, unitPriceUSD: 3.50, subtotalUSD: 10.50 },
        { id: 'it-2', productId: 'prod-refresco-lata', productName: 'Refresco en Lata', quantity: 2, unitPriceUSD: 1.50, subtotalUSD: 3.00 },
        { id: 'it-3', productId: 'prod-cerveza', productName: 'Cerveza Zulia', quantity: 1, unitPriceUSD: 2.00, subtotalUSD: 2.00 }
      ],
      payments: []
    },

    // ORDEN 4: HOY - Barra - Pagada Punto de Venta (Mariana / Ana)
    {
      id: 'ORD-7004',
      locationId: 'br-1',
      customerName: 'Cliente Barra',
      tableNumber: 'Barra 01',
      waiterId: 'usr-mesero-ana',
      waiterName: 'Ana Rivas',
      status: 'PAID',
      totalUSD: 12.00,
      totalPaidUSD: 12.00,
      pendingBalanceUSD: 0.00,
      date: todayTS,
      items: [
        { id: 'it-1', productId: 'prod-hamburguesa-clasica', productName: 'Hamburguesa Especial', quantity: 2, unitPriceUSD: 6.00, subtotalUSD: 12.00 }
      ],
      payments: [
        {
          id: 'pay-1',
          amountUSD: 12.00,
          amountBS: 9500.04,
          exchangeRateAtPayment: 791.67,
          paymentMethod: 'PUNTO',
          paymentDate: todayTS,
          notes: 'Tarjeta Débito Mercantil'
        }
      ]
    },

    // ORDEN 5: HOY - SUCURSAL TRAGO SPREXX (Pedro)
    {
      id: 'ORD-8001',
      locationId: 'br-2',
      customerName: 'Valeria Briceño',
      tableNumber: 'Mesa 10',
      waiterId: 'usr-mesero-pedro',
      waiterName: 'Pedro Sánchez',
      status: 'PAID',
      totalUSD: 17.00,
      totalPaidUSD: 17.00,
      pendingBalanceUSD: 0.00,
      date: todayTS,
      items: [
        { id: 'it-1', productId: 'combo-duo-perrito', productName: 'Combo Dúo Perrito', quantity: 2, unitPriceUSD: 8.50, subtotalUSD: 17.00 }
      ],
      payments: [
        {
          id: 'pay-1',
          amountUSD: 17.00,
          amountBS: 13458.39,
          exchangeRateAtPayment: 791.67,
          paymentMethod: 'EFECTIVO_BS',
          paymentDate: todayTS,
          notes: 'Efectivo en billetes de 100 y 50 BS'
        }
      ]
    },

    // ORDEN 6: HISTÓRICO - AYER (29/08) - CIMA
    {
      id: 'ORD-6091',
      locationId: 'br-1',
      customerName: 'Gabriel Torres',
      tableNumber: 'Mesa 5',
      waiterId: 'usr-mesero-carlos',
      waiterName: 'Carlos Mendoza',
      status: 'PAID',
      totalUSD: 34.00,
      totalPaidUSD: 34.00,
      pendingBalanceUSD: 0.00,
      date: yesterdayTS,
      items: [
        { id: 'it-1', productId: 'combo-duo-perrito', productName: 'Combo Dúo Perrito', quantity: 4, unitPriceUSD: 8.50, subtotalUSD: 34.00 }
      ],
      payments: [
        {
          id: 'pay-1',
          amountUSD: 34.00,
          amountBS: 26703.60,
          exchangeRateAtPayment: 785.40,
          paymentMethod: 'PAGO_MOVIL',
          paymentDate: yesterdayTS,
          notes: 'Pago Móvil ayer'
        }
      ]
    },

    // ORDEN 7: HISTÓRICO - FECHA DE CAPTURA (10/08/2026) - CIMA
    {
      id: 'ORD-5012',
      locationId: 'br-1',
      customerName: 'Ignacio Contreras',
      tableNumber: 'Mesa 3',
      waiterId: 'usr-mesero-ana',
      waiterName: 'Ana Rivas',
      status: 'PAID',
      totalUSD: 45.00,
      totalPaidUSD: 45.00,
      pendingBalanceUSD: 0.00,
      date: aug10TS,
      items: [
        { id: 'it-1', productId: 'prod-hamburguesa-clasica', productName: 'Hamburguesa Especial', quantity: 5, unitPriceUSD: 6.00, subtotalUSD: 30.00 },
        { id: 'it-2', productId: 'prod-cerveza', productName: 'Cerveza Zulia', quantity: 5, unitPriceUSD: 2.00, subtotalUSD: 10.00 },
        { id: 'it-3', productId: 'prod-perro-mega-queso', productName: 'Perro Caliente Mega Queso', quantity: 1, unitPriceUSD: 4.50, subtotalUSD: 4.50 }
      ],
      payments: [
        {
          id: 'pay-1',
          amountUSD: 45.00,
          amountBS: 34434.00,
          exchangeRateAtPayment: 765.20,
          paymentMethod: 'DIVISAS',
          paymentDate: aug10TS,
          notes: 'Pago en efectivo USD del día 10/08'
        }
      ]
    }
  ];

  for (const ord of demoOrders) {
    const { items, payments, ...orderData } = ord;
    const orderRef = db.doc(`locations/${ord.locationId}/orders/${ord.id}`);
    await orderRef.set({
      ...orderData,
      orderDate: ord.date,
      createdAt: ord.date,
      updatedAt: ord.date
    });

    for (const item of items) {
      await orderRef.collection('items').doc(item.id).set(item);
    }

    for (const pay of payments) {
      await orderRef.collection('payments').doc(pay.id).set(pay);
    }
  }

  // 8. Registro de Mermas y Traslados
  console.log('🚚 Generando registros de traslados y mermas para auditoría...');
  await db.collection('transfers').add({
    ingredientId: 'ing-pan',
    ingredientName: 'Pan para Perro',
    sourceId: 'wh-1',
    sourceName: 'Depósito Central',
    destId: 'br-1',
    destName: 'Sucursal CIMA',
    quantity: 50,
    unit: 'paquetes',
    userId: 'admin-luis',
    userName: 'Luis Ramírez (Admin)',
    date: todayTS,
    notes: 'Reabastecimiento semanal de panadería'
  });

  await db.collection('waste_logs').add({
    ingredientId: 'ing-papas',
    ingredientName: 'Papas Ralladas Crujientes',
    quantity: 3,
    unit: 'paquetes',
    locationId: 'br-1',
    locationName: 'Sucursal CIMA',
    reason: 'DAMAGE',
    notes: 'Empaques rotos durante la manipulación de descarga',
    userId: 'usr-mesero-carlos',
    userName: 'Carlos Mendoza',
    timestamp: todayTS
  });

  console.log('🎉 ¡Generación completa de datos de prueba exitosa!');
}

seed().catch(err => {
  console.error('❌ Error durante la generación:', err);
  process.exit(1);
});
