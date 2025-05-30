export const basicModels = {
  task: {
    id_customer: null,
    id_responsible: null,
    id_creator: null,
    creation_date: null,
    task: null,
    completed: false,
    execution_date: null,
    comment: null
  },
  activity: {
    id_customer_trip: null,
    id_activity_type: null,
    id_user: null,
    estimated_date: null,
    execution_date: null,
    budget: 0,
    completed: false,
    execution_value: 0,
    comment: null,
    creation_date: null,
    authorizer: null,
    authorized: false,
    budget_authorized: null
  },
  order: {
    id_customer_trip: null,
    id_seller: null,
    date_order: null,
    id_payment_method: null,
    total_quantities: 0,
    system_quantities: 0,
    total_without_tax: 0,
    total_with_tax: 0,
    delivery_date: null
  },
  customerTrip: {
    id_customer: null,
    id_seller: null,
    id_collection: null,
    budget: null,
    budget_quantities: null,
    closed: false,
    comment: null,
    with_budget: true
  },
  customer: {
    company_name: null,
    document: null,
    email: null,
    phone: null,
    id_store_type: null,
    address: null,
    brand_ids: [],
    id_seller: null,
    stores: null,
    id_city: null,
    active: true,
    credit_limit: null,
    with_documents: false,
    social_media: null,
    relevant_details: null
  },
  contact: {
    id_customer: null,
    first_name: null,
    last_name: null,
    document: null,
    gender: null,
    email: null,
    phone: null,
    id_role: null,
    birth_date: null,
    id_city: null,
    relevant_details: null,
    active: true
  },
  rating: {
    id_customer: null,
    id_rating_category: null,
    date_updated: null,
    comments: null
  },
  advance: {
    id_order: null,
    payment_date: null,
    advance_type: 0,
    amount: 0,
    payment: 0,
    balance: null,
    paid: null,
    last_payment_date: null
  },
  user: {
    first_name: null,
    last_name: null,
    document: null,
    gender: null,
    username: null,
    email: null,
    phone: null,
    id_city: null,
    birth_date: null,
    password: null
  },
  photo: {
    id_customer: null,
    url_photo: null
  },
  shipment: {
    id_invoice: null,
    shipment_date: null,
    carrier: null,
    tracking_number: null,
    estimated_delivery_date: null,
    shipment_cost: 0,
    received: false,
    received_date: null,
    details: null
  }
}
