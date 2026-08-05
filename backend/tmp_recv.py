import pika,json

conn = pika.BlockingConnection(pika.ConnectionParameters('127.0.0.1'))
channel = conn.channel()
channel.queue_declare(queue='chat.notify', durable=True)

def callback(ch, method, properties, body):
    print("收到:", json.loads(body)) 
    ch.basic_ack(delivery_tag=method.delivery_tag)

channel.basic_consume(queue='chat.notify', on_message_callback=callback)
print('等待消息...')
channel.start_consuming()
