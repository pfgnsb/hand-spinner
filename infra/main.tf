# この段階で作るのは EC2 1 台である。画面のファイルは Node.js が渡す。
# RDS は作らない。風車は回した状態を残さない。
# 外から入れるポートは、この PC からの 22（SSH）と 80（nginx）だけである。

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-*-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "kazaguruma" {
  name        = "kazaguruma-ec2"
  description = "Kazaguruma EC2. Inbound is this PC only, on 22 and 80."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH from this PC"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  ingress {
    description = "nginx from this PC"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  # これはサーバから外へ出る向きである。SSM が AWS へ届くために残す。
  # 外から入る接続は、上の 22 と 80 だけである。
  egress {
    description = "Outbound for SSM"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "kazaguruma-ec2"
  }
}

resource "aws_iam_role" "kazaguruma" {
  name = "kazaguruma-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.kazaguruma.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "kazaguruma" {
  name = "kazaguruma-ec2"
  role = aws_iam_role.kazaguruma.name
}

resource "aws_key_pair" "kazaguruma" {
  key_name   = "kazaguruma-ec2"
  public_key = file("${path.module}/keys/kazaguruma.pub")
}

resource "aws_instance" "kazaguruma" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.instance_type
  subnet_id                   = sort(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids      = [aws_security_group.kazaguruma.id]
  iam_instance_profile        = aws_iam_instance_profile.kazaguruma.name
  key_name                    = aws_key_pair.kazaguruma.key_name
  associate_public_ip_address = true

  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  tags = {
    Name = "kazaguruma"
  }
}
