# **App Name**: SwiftDine Pro

## Core Features:

- User Authentication & Role Management: Secure login for Administrator, Cashier, and Waiter roles, with Firebase Authentication ensuring appropriate access levels for each user based on their assigned permissions.
- Product & Inventory Management: Administer products with a master fixed USD price, track stock levels specifically for the Central Warehouse and each of the 2 branches, and manage inventory transfers between these locations. Utilizes Firestore for data storage.
- Dynamic Exchange Rate & Historic Rate Saving: An intuitive interface for Administrators and Cashiers to update the USD/BS exchange rate in the 'Configuracion' collection. The system automatically saves the exact exchange rate at the moment of each payment for precise historical accounting.
- Flexible Order Processing (Comandas): Enable Waiters and Cashiers to create and continuously edit customer orders. Add or remove products even after parts of the order have been dispatched. Each item added to an order automatically deducts from the corresponding branch's stock.
- Partial Payment Management: Facilitate partial payments at any stage of an order (before, during, or after dispatch). The system automatically calculates and displays the real-time 'Total USD', 'Total Paid (USD)', and 'Pending Balance (USD)' for each order.
- Orders Dashboard: A dynamic 'Tablero de Comandas' using interactive cards to visually indicate the current payment status of each order, clearly showing whether an account has a pending balance or is fully paid.
- AI-Powered Stock Reorder Suggestions: A tool for administrators that analyzes historical sales data and current inventory levels to recommend optimal reorder quantities for ingredients, aiming to minimize waste and proactively prevent stockouts.

## Style Guidelines:

- The color scheme utilizes a professional dark theme, reflecting modernity and efficiency, appropriate for a business management application.
- Primary color: A vibrant yet grounded blue (#4DB9FF) that conveys reliability and technological precision, designed to stand out against darker backgrounds.
- Background color: A very dark bluish-gray (#1F262E) derived from the primary hue, providing a clean and focused backdrop for content.
- Accent color: A soft, engaging aqua (#97E6F0), used for interactive elements and highlights to ensure visual contrast and draw attention, enhancing user interaction.
- Headlines and prominent text: 'Space Grotesk' (sans-serif), chosen for its modern, slightly technical aesthetic that commands attention.
- Body text and detailed information: 'Inter' (sans-serif), providing excellent readability and a neutral, objective feel for data-heavy sections.
- Utilize a consistent set of clean, minimalist line icons that are easily recognizable and functional, enhancing navigation and feature comprehension without visual clutter.
- Implement a responsive design, optimized for both tablet (e.g., waiters on the floor) and desktop (e.g., cashiers and administrators) usage, ensuring an intuitive layout for different screen sizes and interactions. Features a dashboard layout with interactive cards and clear navigational elements.
- Incorporate subtle, functional animations for feedback on user actions like form submissions, order updates, and successful payments, providing a smooth and responsive user experience without being distracting.