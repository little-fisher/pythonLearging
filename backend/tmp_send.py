import pika,json

conn = pika.BlockingConnection(pika.ConnectionParameters('127.0.0.1'))
channel = conn.channel()
channel.queue_declare(queue='chat.notify', durable=True)

channel.basic_publish(
    exchange='',
    routing_key='chat.notify',
    body=json.dumps({
        'session_id': 'session1',
        'action': 'notify',
    }),
    properties=pika.BasicProperties(
        delivery_mode=2,  # make message persistent
    )
)
print('已发送')
conn.close()