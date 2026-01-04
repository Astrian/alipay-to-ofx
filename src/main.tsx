import { applyDiff } from "webjsx"
import "@unocss/reset/tailwind.css"
import "virtual:uno.css"
import "./style.css"

class App extends HTMLElement {


	constructor() {
		super()
		this.render()
	}

	render = () => {
		const content = (
			<div flex="~ col">
				<h1>支付宝对账单转换 OFX 工具</h1>
				<div border="~" flex="~">
					<div flex="1">
						<button type="type" onclick={this.handleFileSelect}>选择文件</button>
					</div>
				</div>
			</div>
		)

		applyDiff(this, content)
	}

	handleFileSelect = () => {
		// 上传 CSV 文件
		const input = document.createElement("input")
		input.type = "file"
		input.accept = ".csv"
		input.onchange = this.handleFileChange
		input.click()
	}

	handleFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement
		if (!input.files || input.files.length <= 0) return
		const file = input.files[0]
		if (!file) return
		// 转换 gb2312
		const text = await this.convertGb2312ToUnicode(file)
		console.log(text)
		// 移除非标准行，并按行转换交易记录
		const rawRecords = text.split('\n').slice(5).slice(0, -8).join('\n')
		let records: Transation[] = []
		rawRecords.split('\n').forEach(line => {
			let items = line.split(',')
			items = items.map(item => item.split(`\t`)[0].trim())
			console.log(items)
			const [transation_no, merchant_order_no, transation_create_time, pay_time, recent_modify_time, transaction_source, type, partner, product_name, amount, receipt_or_payment, status, service_fee, success_refund, note, fund_status] = items
			records.push({
				transation_no,
				merchant_order_no,
				transation_create_time: new Date(this.dateStringToIso(transation_create_time)),
				pay_time: pay_time ? new Date(this.dateStringToIso(pay_time)) : undefined,
				recent_modify_time: new Date(this.dateStringToIso(recent_modify_time)),
				transaction_source,
				type,
				partner,
				product_name,
				amount: parseFloat(amount),
				receipt_or_payment: (() => {
					if (receipt_or_payment === '收入') return 'receipt'
					if (receipt_or_payment === '支出') return 'payment'
					if (receipt_or_payment === '不计收支') return 'transfer'
					return 'unknown'
				})(),
				status,
				service_fee: parseFloat(service_fee),
				success_refund: parseFloat(success_refund),
				note,
				fund_status: (() => {
					switch (fund_status) {
						case '已支出':
							return 'paid'
						case '已收入':
							return 'received'
						case '资金转移':
							return 'transferred'
						default:
							return 'unknown'
					}
				})()
			})
		})

		let ofxLogs: string[] = []
		records.forEach(record => {
			ofxLogs[ofxLogs.length] = `
					<STMTTRN>
						<TRNTYPE>${record.fund_status === 'received' ? 'CREDIT' : 'DEBIT'}</TRNTYPE>
						<DTPOSTED>${this.ofxDateTimeUtility(new Date(record.pay_time ?? record.transation_create_time))}</DTPOSTED>
						<TRNAMT>${this.amountCalculate(record)}</TRNAMT>
						<FITID>${record.transation_no}</FITID>
						<REFNUM>${record.transation_no}</REFNUM>
						<NAME>${record.partner}</NAME>
						<MEMO>${`${record.product_name} ${record.note}`.trim()}</MEMO>
					</STMTTRN>`
		})

		const account = text.split('\n')[1].split('[')[1].split(']')[0]

		// 计算第一笔和最后一笔交易时间
		const timeRange = records.reduce((acc, record) => {
			const payTime = record.pay_time ?? record.transation_create_time
			if (!acc.min || payTime < acc.min) {
				acc.min = payTime
			}
			if (!acc.max || payTime > acc.max) {
				acc.max = payTime
			}
			return acc
		}, { min: null as Date | null, max: null as Date | null })

		const ofxHeader = `
<?xml version="1.0" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="202" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
	<SIGNONMSGSRSV1>
		<SONRS>
			<STATUS>
				<CODE>0</CODE>
				<SEVERITY>INFO</SEVERITY>
				<MESSAGE>Converted by alipay-to-ofx tool</MESSAGE>
			</STATUS>
			<DTSERVER>${this.ofxDateTimeUtility(new Date())}</DTSERVER>
			<LANGUAGE>CHI</LANGUAGE>
			<FI>
				<ORG>支付宝</ORG>
				<FID>ALIPAY</FID>
			</FI>
		</SONRS>
	</SIGNONMSGSRSV1>
	<CREDITCARDMSGSRSV1>
		<CCSTMTTRNRS>
			<TRNUID>0</TRNUID>
			<STATUS>
				<CODE>0</CODE>
				<SEVERITY>INFO</SEVERITY>
			</STATUS>
			<CCSTMTRS>
				<CURDEF>CNY</CURDEF>
				<CCACCTFROM>
					<ACCTID>${account}</ACCTID>
				</CCACCTFROM>
				<BANKTRANLIST>
					<DTSTART>${timeRange.min ? this.ofxDateTimeUtility(timeRange.min) : ''}</DTSTART>
					<DTEND>${timeRange.max ? this.ofxDateTimeUtility(timeRange.max) : ''}</DTEND>`

		const ofxFooter = `
				</BANKTRANLIST>
			</CCSTMTRS>
		</CCSTMTTRNRS>
	</CREDITCARDMSGSRSV1>
</OFX>`

		const ofxText = ofxHeader + '\n' + ofxLogs.join('\n') + '\n' + ofxFooter

		// 创建下载链接
		const blob = new Blob([ofxText], { type: 'application/x-ofx' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'alipay_export.ofx'
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	async convertGb2312ToUnicode(file: File) {
		const arrayBuffer = await file.arrayBuffer()
		const decoder = new TextDecoder('gb2312')
		const text = decoder.decode(arrayBuffer)
		return text
	}

	dateStringToIso(dateString: string) {
		const date = dateString.split(' ')[0]
		const time = dateString.split(' ')[1]
		return `${date}T${time}+0800`
	}

	ofxDateTimeUtility(date: Date) {
		const year = date.getFullYear()
		const month = date.getMonth() + 1
		const day = date.getDate()
		const hours = date.getHours()
		const minutes = date.getMinutes()
		const seconds = date.getSeconds()
		const milliseconds = date.getMilliseconds()
		const timezoneOffset = date.getTimezoneOffset()
		const timezoneHours = Math.floor(Math.abs(timezoneOffset) / 60)
		const timezoneSign = timezoneOffset < 0 ? '+' : '-'
		const timezone = `[${timezoneSign}${timezoneHours.toString().padStart(2, '0')}]`
		return `${year}${month.toString().padStart(2, '0')}${day.toString().padStart(2, '0')}${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}${timezone}`
	}

	amountCalculate(record: Transation) {
		const actualPay: number = record.fund_status === 'received' ? record.amount : -record.amount
		return actualPay - record.service_fee
	}
}

customElements.define("x-app", App)
