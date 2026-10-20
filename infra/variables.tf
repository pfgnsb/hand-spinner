variable "instance_type" {
  description = "動作確認用の EC2。課題管理ボードと同じく、無料プランで使う t4g.small を初期値にする。"
  type        = string
  default     = "t4g.small"
}

variable "allowed_cidr" {
  description = "入ってくる接続を許すアドレス。この PC の公開アドレスを /32 で書く。値は terraform.tfvars に置く。"
  type        = string
}
