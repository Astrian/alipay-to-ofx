declare global {
	interface Transation {
		transation_no: string
		merchant_order_no: string
		transation_create_time: Date
		pay_time?: Date
		recent_modify_time: Date
		transaction_source: string
		type: string
		partner: string
		product_name: string
		amount: number
		receipt_or_payment: 'receipt' | 'payment' | 'transfer' | 'unknown'
		status: string
		service_fee: number
		success_refund: number
		note: string
		fund_status: string
	}
}

export {}
